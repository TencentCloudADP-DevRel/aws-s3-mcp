import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://944fc762bf083e328185347cb4c9b81d.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'd7d92d039de241beb3676ad4ee2df30b',
    secretAccessKey: 'e59f57a34eb94eca3e78de0383e728f03ace66a1e3105fcfec4154c7208953ce',
  },
  forcePathStyle: true,
});

const fileContent = readFileSync('/Users/pro/CodeBuddy/hunyuan3d/hunuyan3d.html', 'utf8');

const command = new PutObjectCommand({
  Bucket: 'hunuyan3d',
  Key: 'hunuyan3d.html',
  Body: fileContent,
  ContentType: 'text/html',
  ACL: 'public-read',
});

try {
  const response = await s3Client.send(command);
  console.log('✅ 上传成功!');
  console.log('文件 URL: https://pub-6c84ac2b18a045a1a7c487eccd0d65c7.r2.dev/hunuyan3d.html');
  console.log('响应:', response);
} catch (error) {
  console.error('❌ 上传失败:', error.message);
  process.exit(1);
}
