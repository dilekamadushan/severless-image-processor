export const getErrorMessage = message => ({
    statusCode: 500,
    headers: {
        'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
        message
    })
});

export const isAllowedSize = size => size <= MAX_SIZE;

export const isAllowedMimeType = () => true;

export const isAllowedFile = (size) =>
    isAllowedSize(size) && isAllowedMimeType();

export const uploadToS3 = (bucket, key, buffer, mimeType) =>
    new Promise((resolve, reject) => {
        s3.upload(
            {
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType
            },
            function (err, data) {
                if (err) reject(err);
                resolve(data);
            }
        );
    });
