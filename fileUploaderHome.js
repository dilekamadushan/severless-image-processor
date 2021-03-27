"use strict";
const AWS = require("aws-sdk");
const uuid = require("uuid/v4");
const Jimp = require("jimp");
const s3 = new AWS.S3();
const formParser = require("./formParser");

const bucket = process.env.Bucket;
const MAX_SIZE = 4500000; // 4MB

const PNG_MIME_TYPE = "image/png";
const JPEG_MIME_TYPE = "image/jpeg";
const JPG_MIME_TYPE = "image/jpg";

const axios = require('axios');

const MIME_TYPES = [PNG_MIME_TYPE, JPEG_MIME_TYPE, JPG_MIME_TYPE];

module.exports.handler = async event => {
  console.log("Inside Handler event");

  if (event.httpMethod === 'POST') {
    console.log("POST method received");

    try {
      const formData = await formParser.parser(event, MAX_SIZE);
      const file = formData.files[0];


      if (!isAllowedFile(file.content.byteLength, file.contentType))
        getErrorMessage("File size or type not allowed");

      const uid = uuid();

      const originalKey = `${uid}_original_${file.filename}`;

      const [originalFile] = await Promise.all([
        uploadToS3(bucket, originalKey, file.content, file.contentType)
      ]);

      const signedOriginalUrl = s3.getSignedUrl("getObject", {
        Bucket: originalFile.Bucket,
        Key: originalKey,
        Expires: 60000
      });

      const S3response = {
          id: uid,
          mimeType: file.contentType,
          originalKey: originalFile.key,
          bucket: originalFile.Bucket,
          fileName: file.filename,
          originalUrl: signedOriginalUrl,
          originalSize: file.content.byteLength
        };

      console.log("S3 File Uploaded details " +JSON.stringify(S3response));

      let axiosConfig = {
        headers: {
          'Content-Type': 'application/json'
        }
      };


      const faceMaskRequest = {
        image_path: originalFile.key
      };

      console.log("Sending the request to face mask api "+ JSON.stringify(faceMaskRequest));

      const faceMaskResponse = await axios.post('http://3.20.250.131:5000/validate', faceMaskRequest, axiosConfig);

      console.log("Response from face mask api "+ JSON.stringify(faceMaskResponse.data));


      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: faceMaskResponse.data
        }),
      };
    } catch (e) {
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

const getErrorMessage = message => ({
  statusCode: 500,
  headers: {
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({
    message
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

const resize = (buffer, mimeType, width) =>
  new Promise((resolve, reject) => {
    Jimp
      .read(buffer)
      .then(image => image.resize(width, Jimp.AUTO).quality(70).getBufferAsync(mimeType))
      .then(resizedBuffer => resolve(resizedBuffer))
      .catch(error => reject(error));
  });
