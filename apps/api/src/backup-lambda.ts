import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createBackup } from './backup/backup';
import { createDb } from './db/client';

/** Respaldo programado: exporta la base y la guarda cifrada en el bucket de respaldos (fase 9c). */
export const handler = async () => {
  const bucket = process.env.BACKUP_BUCKET;
  const prefix = process.env.BACKUP_PREFIX ?? 'respaldos';
  const parameter = process.env.DATABASE_URL_PARAM;
  if (!bucket || !parameter) throw new Error('Faltan BACKUP_BUCKET o DATABASE_URL_PARAM.');

  const ssm = new SSMClient({});
  const url = (await ssm.send(new GetParameterCommand({ Name: parameter, WithDecryption: true })))
    .Parameter?.Value;
  if (!url) throw new Error('El parámetro de la base de datos está vacío.');

  const db = createDb(url, 1);
  try {
    const now = new Date();
    const backup = await createBackup(db, now);
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z');
    const key = `${prefix}/pos-${stamp}.ndjson.gz`;
    await new S3Client({}).send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: backup.file,
        ContentType: 'application/gzip',
        ServerSideEncryption: 'AES256',
      }),
    );
    // Solo se registran conteos: nunca el contenido del respaldo.
    console.log(
      JSON.stringify({ evento: 'respaldo', key, bytes: backup.file.length, filas: backup.rows }),
    );
    return { key, bytes: backup.file.length, rows: backup.rows, tables: backup.tables };
  } finally {
    await db.destroy();
  }
};
