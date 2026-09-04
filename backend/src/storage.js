import './config.js';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function uploadDocument(file, registrationId) {
  if (!process.env.AWS_S3_BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not configured');
  }
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
  const key = `registrations/${registrationId}/${Date.now()}-${safeName}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));
  return {
    key,
    url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
  };
}

export async function getDocument(key) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key
  }));
  if (!response.Body) throw new Error('Document could not be read from storage');
  return { body: response.Body, contentType: response.ContentType || 'application/octet-stream' };
}
