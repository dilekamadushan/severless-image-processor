"use strict";
const AWS = require("aws-sdk");
AWS.config.update({region: 'us-east-1'});
const uuid = require("uuid/v4");
const Jimp = require("jimp");
const s3 = new AWS.S3();
const formParser = require("./formParser");
var rekognition = new AWS.Rekognition();

const bucket = process.env.Bucket;
const MAX_SIZE = 4500000; // 4MB

const PNG_MIME_TYPE = "image/png";
const JPEG_MIME_TYPE = "image/jpeg";
const JPG_MIME_TYPE = "image/jpg";

const axios = require('axios');

const MIME_TYPES = [PNG_MIME_TYPE, JPEG_MIME_TYPE, JPG_MIME_TYPE];

module.exports.registerHandler = async event => {
  console.log("Inside Handler event");

  if (event.httpMethod === 'POST') {
    console.log("POST method received");

    try {
      const formData = await formParser.parser(event, MAX_SIZE);
      console.log(formData);
      const file = formData.files[0];
      const username = formData.name;


      if (!isAllowedFile(file.content.byteLength, file.contentType))
        return getErrorMessage("File size or type not allowed");

      const uid = username + "";

      const originalKey = `user_${uid}_${file.filename}`;

      const [originalFile] = await Promise.all([
        uploadToS3(bucket, originalKey, file.content, file.contentType)
      ]);

      console.log('upload face')
      var params = {
        CollectionId: "userphotos"
      };
      try {
        let data = await rekognition.createCollection(params).promise();
        console.log(data);
      } catch (e) {
        console.log(e);
      }
      // await rekognition.createCollection(params, function(err, data) {
      //    if (err) {
      //      console.log(err, err.stack); // an error occurred
      //    }
      //    else     console.log(data);           // successful response
      //    /*
      //    data = {
      //     CollectionArn: "aws:rekognition:us-west-2:123456789012:collection/myphotos", 
      //     StatusCode: 200
      //    }
      //    */
      // });

      console.log('colletion face')
      var params = {
        CollectionId: "userphotos", 
        DetectionAttributes: [
        ], 
        ExternalImageId: uid, 
        Image: {
         S3Object: {
          Bucket: originalFile.Bucket, 
          Name: originalKey
         }
        }
       };

       try {
        let data = await rekognition.indexFaces(params).promise();
        console.log(data);
      } catch (e) {
        console.log(e);
      }
      //   await rekognition.indexFaces(params, function(err, data) {
      //    if (err) {
      //      console.log(err, err.stack); // an error occurred
      //    }
      //    else console.log(data)
      //  });
       console.log('index face')
       return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          'status': 'success'
        }),
      };
    } catch (e) {
      console.error(e);
      console.log(JSON.stringify(e));
      return getErrorMessage(e.message);

    }
  }
  else {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify('Hello from Lambda!'),
    };

  }

};

module.exports.handler = async event => {
  console.log("Inside Handler event");

  if (event.httpMethod === 'POST') {
    console.log("POST method received");

    try {
      const formData = await formParser.parser(event, MAX_SIZE);

      console.log(formData)

      const uid = uuid();

      const originalKey = `${uid}_original.jpg`;

      const [originalFile] = await Promise.all([
        uploadToS3Base64(bucket, originalKey, formData.image)
      ]);

      let axiosConfig = {
        headers: {
          'Content-Type': 'application/json'
        }
      };


      const faceMaskRequest = {
        image_path: originalFile.key
      };

      console.log("Sending the request to face mask api "+ JSON.stringify(faceMaskRequest));

      const faceMaskResponse = await axios.post('http://face-mask-mask-alb-527643213.us-east-1.elb.amazonaws.com:5000/validate', faceMaskRequest, axiosConfig);

      console.log("Response from face mask api "+ JSON.stringify(faceMaskResponse.data));

      const status_list = [];
      for (let s of faceMaskResponse.data.status.status) {
        var params = {
          CollectionId: "userphotos", 
          FaceMatchThreshold: 90, 
          Image: {
           S3Object: {
            Bucket: bucket, 
            Name: s.file
           }
          }, 
          MaxFaces: 1
         };
         console.log(s, bucket)
         try {
            let data = await rekognition.searchFacesByImage(params).promise();
            console.log(data);  
             let n = 'Unknown'
             if (data['FaceMatches'].length > 0) {
               n = data['FaceMatches'][0]['Face']['ExternalImageId'];
             }
             status_list.push({'status': s.status, 'name':n})
          } catch (e) {
            console.log(e);
            return getErrorMessage(e.message);
          }

        //  await rekognition.searchFacesByImage(params, function(err, data) {
        //    if (err) {
        //      console.log(err, err.stack);
        //      return getErrorMessage(err.message);
        //      } // an error occurred
        //    else {
        //      console.log(data);  
        //      let n = 'Unknown'
        //      if (data['FaceMatches'].length > 0) {
        //        n = data['FaceMatches'][0]['Face']['ExternalImageId'];
        //      }
        //      status_list.push({'status': s.status, 'name':n})
        //    }
        //  });
         console.log('Done')
      }

      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: status_list
        }),
      };
    } catch (e) {
      console.log(e);
      return getErrorMessage(e.message);

    }
  }
  else {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify('Hello from Lambda!'),
    };

  }
};

const getErrorMessage = message => ({
  statusCode: 500,
  headers: {
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({
    'error': message
  })
});

const isAllowedSize = size => size <= MAX_SIZE;

const isAllowedMimeType = mimeType => true;
  //MIME_TYPES.find(type => type === mimeType);

const isAllowedFile = (size, mimeType) =>
  isAllowedSize(size) && isAllowedMimeType(mimeType);

const uploadToS3 = (bucket, key, buffer, mimeType) =>
  new Promise((resolve, reject) => {
    s3.upload(
      {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType
      },
      function(err, data) {
        if (err) reject(err);
        resolve(data);
      }
    );
  });

  const uploadToS3Base64 = (bucket, key, buffer) =>
  new Promise((resolve, reject) => {
    const buf = Buffer.from(buffer.replace(/^data:image\/\w+;base64,/, ""),'base64');
    s3.upload(
      {
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentEncoding: 'base64',
        ContentType: 'image/png'
      },
      function(err, data) {
        if (err) reject(err);
        resolve(data);
      }
    );
  });

const resize = (buffer, mimeType, width) =>
  new Promise((resolve, reject) => {
    Jimp
      .read(buffer)
      .then(image => image.resize(width, Jimp.AUTO).quality(70).getBufferAsync(mimeType))
      .then(resizedBuffer => resolve(resizedBuffer))
      .catch(error => reject(error));
  });
