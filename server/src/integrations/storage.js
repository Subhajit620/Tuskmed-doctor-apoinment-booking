const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

/**
 * Cloud file storage integration (4 of 4). Real implementation targets any
 * S3-compatible bucket. Mock mode writes to server/uploads and serves it
 * statically (see src/index.js) - no cloud credentials needed for local
 * dev/tests, same interface either way.
 */

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

async function uploadFile({ buffer, originalName, mimeType }) {
  const ext = path.extname(originalName || '') || '';
  const key = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  if (env.mock.storage || !env.storage.accessKeyId) {
    fs.writeFileSync(path.join(uploadsDir, key), buffer);
    return { url: `/uploads/${key}`, key };
  }

  // Real S3 upload (aws-sdk v3 kept as an optional peer dependency so the
  // mock path above works without installing it).
  // eslint-disable-next-line global-require
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: env.storage.region,
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: env.storage.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  const base = env.storage.publicBaseUrl || `https://${env.storage.bucket}.s3.${env.storage.region}.amazonaws.com`;
  return { url: `${base}/${key}`, key };
}

module.exports = { uploadFile };
