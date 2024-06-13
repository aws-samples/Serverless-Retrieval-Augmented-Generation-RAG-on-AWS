export const syncLambda = async (url, method, payload, callback)=>{
    let response;
    try {
      // TODO: catch error codes here.
      response = await window.fetch(url, {
          method,
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'text/plain',
          },
          mode: "cors"
        });
        console.log(response);
        callback(await response.json());
        return;
      // return {statusCode: response.status, json: await response.json()};
    }
    catch (err){
      console.log('Something went wrong');
      console.log(err);
      return;
    }
  }
  

  export const streamingLambda = async (url, method, headers, payload, textCallback, metadataCallback=null)=>{
    let response;
    try {
      // TODO: catch error codes here.
      response = await window.fetch(url, {
          method,
          body: JSON.stringify(payload),
          headers,
          mode: "cors"
        });
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true){
        const {value, done} = await reader.read();
        if (value && value.length > 0 && value.slice(0,3,1) === '_~_'){
          let valueArray = value.split('_~_');
          const metadata = valueArray.splice(0,2)[1];
          if (metadataCallback){
            metadataCallback(JSON.parse(metadata));
          }
          if (value.length > 0){
            textCallback(valueArray[0]);
          }
        }
        else {
          textCallback(value);
        }
        if (done) break;
      }
    }
    catch (err){
      console.log('Something went wrong');
      console.log(err);
      return;
    }
  }