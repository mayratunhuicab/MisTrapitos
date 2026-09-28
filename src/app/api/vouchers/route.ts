import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

function parseServiceAccount(raw: string | undefined) {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

async function getOrCreateFolder(drive: any, folderName: string, targetEmail: string) {
  const query = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const existing = res.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const folderId = created.data.id;
  if (folderId && targetEmail) {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: targetEmail,
      },
      fields: 'id',
    });
  }

  return folderId;
}

export async function POST(request: NextRequest) {
  try {
    const { dataUrl, filename, subject, metadata } = await request.json();

    if (!dataUrl || !filename || !subject) {
      return NextResponse.json(
        { error: 'Faltan datos del comprobante.' },
        { status: 400 }
      );
    }

    const serviceAccount = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const targetEmail = process.env.GOOGLE_DRIVE_TARGET_EMAIL || 'mistrapitos70@gmail.com';
    const folderName = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'MisTrapitos Vouchers';

    if (!serviceAccount) {
      return NextResponse.json(
        { error: 'No está configurada la credencial de Google Drive.' },
        { status: 500 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    const folderId = await getOrCreateFolder(drive, folderName, targetEmail);

    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: 'El comprobante no tiene un formato válido.' },
        { status: 400 }
      );
    }

    const [, mimeType, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    const uploadedFile = await drive.files.create({
      requestBody: {
        name: filename,
        parents: folderId ? [folderId] : undefined,
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: 'id, webViewLink, webContentLink',
    });

    if (targetEmail) {
      await drive.permissions.create({
        fileId: uploadedFile.data.id!,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: targetEmail,
        },
        fields: 'id',
      });
    }

    return NextResponse.json({
      ok: true,
      fileId: uploadedFile.data.id,
      driveUrl: uploadedFile.data.webViewLink || uploadedFile.data.webContentLink,
      subject,
      metadata,
    });
  } catch (error) {
    console.error('Error uploading voucher to Google Drive:', error);
    return NextResponse.json(
      { error: 'No se pudo guardar el comprobante en Google Drive.' },
      { status: 500 }
    );
  }
}
