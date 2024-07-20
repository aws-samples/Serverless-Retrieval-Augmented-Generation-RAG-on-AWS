import React, { useState, useEffect } from 'react';
import {
  Box,
  SpaceBetween,
  Checkbox,
  Button,
  Input,
  Header,
  Container,
  Textarea
} from '@cloudscape-design/components';

const ChatHistoryComponent = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [displayedItems, setDisplayedItems] = useState([]);
  const [itemsToLoad, setItemsToLoad] = useState(5);

  useEffect(() => {
    const storedChatHistory = localStorage.getItem('chat_history');
    if (storedChatHistory) {
      const parsedChatHistory = JSON.parse(storedChatHistory);
      setChatHistory(parsedChatHistory);
      setDisplayedItems(chatHistory.slice(0, itemsToLoad));
    }
  }, []);

  useEffect(() => {
    setDisplayedItems(chatHistory.slice(0, itemsToLoad));
  }, [itemsToLoad, chatHistory]);

  const handleQuestionChange = (index, value) => {
    const updatedHistory = chatHistory.map((item, i) =>
      i === index ? { ...item, question: value } : item
    );
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const handleAnswerChange = (index, value) => {
    const updatedHistory = chatHistory.map((item, i) =>
      i === index ? { ...item, answer: value } : item
    );
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const handleSelectAll = (select) => {
    const updatedHistory = chatHistory.map((item) => ({
      ...item,
      checked: select,
    }));
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const handleCheckboxChange = (index, checked) => {
    const updatedHistory = chatHistory.map((item, i) =>
      i === index ? { ...item, checked } : item
    );
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const handleDelete = (index) => {
    const updatedHistory = chatHistory.filter((_, i) => i !== index);
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const loadMoreItems = () => {
    setItemsToLoad((prev) => prev + 5);
  };

  const addNewItem = () => {
    const newItem = { 
      question: '', 
      answer: '', 
      checked: false,
      date: new Date().toISOString()
    };
    const updatedHistory = [newItem, ...chatHistory];
    setChatHistory(updatedHistory);
    localStorage.setItem('chat_history', JSON.stringify(updatedHistory));
  };

  const downloadHistory = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(chatHistory, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "chat_history.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <Container header={<Header variant="h1">Manage Chat History</Header>}>
      <ul>
        <li>Selected messages are included in the history of the chat. </li>
        <li>You can add new messages for debugging purposes.</li>
        <li>Messages are sorted in reverse chronological order, with the most recent message on top.</li>
      </ul>
      <Box padding="m">
        <SpaceBetween size="m" direction="vertical">
          <Box direction="horizontal" alignItems="center" justifyContent="space-between">
            <Button onClick={addNewItem}>Add New Item</Button>
            <Box>
              <Button onClick={() => handleSelectAll(true)}>Select All</Button>
              <Button onClick={() => handleSelectAll(false)}>Deselect All</Button>
              {
              chatHistory?.length > 0? 
                <Button onClick={() => downloadHistory()}>Download History</Button> 
                : null
              }
            </Box>
          </Box>
          {displayedItems.map((item, index) => (
            <Box key={index} padding={{ vertical: 's' }} border={{ color: 'black', style: 'solid' }}>
              <Box direction="horizontal" alignItems="center" justifyContent="space-between">
                <Box direction="horizontal" alignItems="center">
                  <Checkbox
                    checked={item.checked || false}
                    onChange={({ detail }) =>
                      handleCheckboxChange(index, detail.checked)
                    }
                  >
                    {item.date} via <em>{item.model ? item.model : "User Input"}</em>
                  </Checkbox>

                </Box>
                <Button onClick={() => handleDelete(index)}>Delete</Button>
              </Box>
              <SpaceBetween size="s" direction="vertical">
                <Input
                  value={item.question}
                  onChange={({ detail }) =>
                    handleQuestionChange(index, detail.value)
                  }
                  placeholder="Question"
                />
                <Textarea
                  value={item.answer}
                  onChange={({ detail }) =>
                    handleAnswerChange(index, detail.value)
                  }
                  placeholder="Answer"
                />
              </SpaceBetween>
            </Box>
          ))}
          {itemsToLoad < chatHistory.length && (
            <Button onClick={loadMoreItems}>Load More</Button>
          )}
        </SpaceBetween>
      </Box>
    </Container>
  );
};

export default ChatHistoryComponent;
