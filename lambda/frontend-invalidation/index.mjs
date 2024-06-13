import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const cloudfront = new CloudFrontClient();

export async function handler (event) {
    const distributionId = process.env.DISTRIBUTION_ID;
    const paths = ['/index.html'];

    try {
        const command = new CreateInvalidationCommand({
            DistributionId: distributionId,
            InvalidationBatch: {
                CallerReference: `${Date.now()}`,
                Paths: {
                    Quantity: paths.length,
                    Items: paths
                }
            }
        });

        const invalidation = await cloudfront.send(command);

        console.log(`Invalidation created: ${invalidation.Invalidation?.Id}`);
    } catch (error) {
        console.error(`Error creating invalidation: ${error.message}`);
        throw error;
    }
};