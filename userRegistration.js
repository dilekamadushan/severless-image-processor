const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-2'});

//*/ get reference to S3 client
var s3 = new AWS.S3();
var ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
exports.handler = (event, context, callback) => {
    console.log(event.body);
    let reqBody = JSON.parse(event.body);

    let userDetails = {
        TableName: 'Users',
        Key: {
            'email' : {S: reqBody.email}
        },

    };

    ddb.getItem(userDetails, function(err, data) {
        if (err) {
            console.log("Error", err);
            callback(err, null)
        } else {
            if(data.Item) {
                // email already exists
                let response = {
                    "statusCode": 500,
                    "body": JSON.stringify({message: "email already exists!"}),
                    "isBase64Encoded": false
                };
                callback(null, response);
            } else {
                let userDetails = {
                    TableName: 'Users',
                    Item: {
                        'firstName':  {S: reqBody.firstName},
                        'lastName':  {S: reqBody.lastName},
                        'email' : {S: reqBody.email}
                    }
                };
                let encodedImage = reqBody.image;
                let decodedImage = Buffer.from(encodedImage, 'base64');
                var filePath = "avatars/" + reqBody.email + ".jpg"
                var params = {
                    "Body": decodedImage,
                    "Bucket": "msc-group4-cloud-employees",
                    "Key": filePath,
                    "Metadata": {
                        'email': reqBody.email,
                        'name': reqBody.firstName + ' ' + reqBody.lastName
                    },
                };

                s3.upload(params, function(err, data){
                    if(err) {
                        callback(err, null);
                    } else {
                        ddb.putItem(userDetails, function(err, data) {
                            if (err) {
                                callback(err, null);
                            } else {
                                let response = {
                                    "statusCode": 200,
                                    "body": JSON.stringify(data),
                                    "isBase64Encoded": false
                                };
                                callback(null, response);
                            }
                        });
                    }
                });
            }
        }
    });
};