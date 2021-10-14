"use strict";
const AWS = require("aws-sdk");
const uuid = require("uuid/v4");
const s3 = new AWS.S3();
const formParser = require("./formParser");
const axios = require('axios');
import {uploadToS3, getErrorMessage, isAllowedFile} from "./utils";


const bucket = process.env.Bucket;
const MAX_SIZE = 4500000; // 4MB

module.exports.handler = async event => {

    if (event.httpMethod === 'POST') {

        try {
            const formData = await formParser.parser(event, MAX_SIZE);
            const file = formData.files[0];


            if (!isAllowedFile(file.content.byteLength))
                getErrorMessage("File size or type not allowed");

            const uid = uuid();

            const originalKey = `${uid}_original_${file.filename}`;

            const [originalFile] = await Promise.all([
                uploadToS3(bucket, originalKey, file.content, file.contentType)
            ]);
            s3.getSignedUrl("getObject", {
                Bucket: originalFile.Bucket,
                Key: originalKey,
                Expires: 60000
            });
            let axiosConfig = {
                headers: {
                    'Content-Type': 'application/json'
                }
            };


            const faceMaskRequest = {
                image_path: originalFile.key
            };


            const faceMaskResponse = await axios.post('http://3.20.250.131:5000/validate', faceMaskRequest, axiosConfig);


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
    } else {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify('Hello from Lambda!'),
        };

    }

};
