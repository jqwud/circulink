// Photo uploads. Files are stored under UPLOAD_DIR:
//   public/   item, handover and return photos, served to everyone at /uploads/public
//   private/  ID photos, served only through the staff route in routes/admin.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './errors.js';

export const MAX_UPLOAD_BYTES = config.uploadMaxBytes;
const LABELS_WE_TRY = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'application/octet-stream'];

const badFileType = () => new HttpError(400, 'Only JPG, PNG or WEBP photos are allowed.', 'bad_file_type');

// What the first bytes say the file really is, whatever the phone or browser claimed.
export function imageTypeOf(head) {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function receiver(subdir) {
  const dir = path.join(config.uploadDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(12).toString('hex')}.upload`),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    // A quick first filter on the label; the real check reads the file itself (below).
    fileFilter: (_req, file, cb) => (LABELS_WE_TRY.includes(file.mimetype) ? cb(null, true) : cb(badFileType())),
  }).single('file');
}

// After the file is saved: check its real type, then give it the matching extension.
function checkSavedImage(req, _res, next) {
  if (!req.file) return next();
  const head = Buffer.alloc(12);
  const fd = fs.openSync(req.file.path, 'r');
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  const ext = imageTypeOf(head);
  if (!ext) {
    fs.rmSync(req.file.path, { force: true });
    return next(badFileType());
  }
  const filename = req.file.filename.replace(/\.upload$/, `.${ext}`);
  const finalPath = path.join(path.dirname(req.file.path), filename);
  fs.renameSync(req.file.path, finalPath);
  req.file.filename = filename;
  req.file.path = finalPath;
  next();
}

export const publicUpload = [receiver('public'), checkSavedImage];
export const privateUpload = [receiver('private'), checkSavedImage];

// Photo fields must point at a file our own upload endpoint created. Empty means "no photo".
const OWN_PHOTO = /^\/uploads\/public\/[a-f0-9]{24}\.(jpg|png|webp)$/;
export function ownPhoto(value) {
  if (value === null || value === undefined || value === '') return null;
  const ok = typeof value === 'string' && OWN_PHOTO.test(value)
    && fs.existsSync(path.join(config.uploadDir, 'public', path.basename(value)));
  if (!ok) throw new HttpError(400, 'Use a photo uploaded in the app.', 'bad_photo');
  return value;
}

// Deletes a private file (an old ID photo). Only ever inside the private folder.
export function removePrivateFile(name) {
  if (!name) return;
  fs.rmSync(path.join(config.uploadDir, 'private', path.basename(name)), { force: true });
}
