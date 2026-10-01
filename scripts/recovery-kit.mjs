import process from 'node:process';
import {log} from 'node:console';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [userId,out]=process.argv.slice(2);
if(!userId||!out||!/^[a-zA-Z0-9_-]{1,128}$/.test(userId))throw new Error('Usage: node scripts/recovery-kit.mjs USER_ID PRIVATE_DIRECTORY');
const directory=path.resolve(out);
if(!directory.startsWith(path.resolve('.private')+path.sep))throw new Error('Output must be inside .private/');
await mkdir(directory,{recursive:true,mode:0o700});
const raw=randomBytes(16).toString('hex'),code=raw.match(/.{8}/g).join('-'),hash=createHash('sha256').update(raw).digest('hex');
// No public route or master credential: the administrator must apply this hash via D1.
const sql=`DELETE FROM session WHERE userId='${userId}';\nDELETE FROM auth_sessions;\nDELETE FROM auth_challenges;\nINSERT INTO recoveryCode(hash,userId,createdAt) VALUES('${hash}','${userId}',${Date.now()});\n`;
await writeFile(path.join(directory,'code.txt'),`Emergency Highlights recovery code\n${code}\nUse once at https://highlights.rahulshankar.com.\n`,{mode:0o600,flag:'wx'});
await writeFile(path.join(directory,'apply.sql'),sql,{mode:0o600,flag:'wx'});
log('Private recovery kit created. Apply its SQL through authorized D1 access, then use the code through the normal sign-in page.');
