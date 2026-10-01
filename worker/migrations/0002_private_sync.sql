create table if not exists auth_challenges(id text primary key, email text not null, code_hash text not null, expires integer not null, attempts integer not null default 0);
create table if not exists auth_sessions(token_hash text primary key, expires integer not null);
create table if not exists request_limits(id text primary key, count integer not null, expires integer not null);
create table if not exists records(entity text not null check(entity in ('book','highlight')), id text not null, payload text not null, clocks text not null, revision integer not null, operation_id text not null, primary key(entity,id));
create table if not exists sync_receipts(operation_id text primary key, created_at text not null);
create table if not exists changes(seq integer primary key autoincrement, entity text not null, entity_id text not null, payload text not null);
create trigger if not exists records_insert after insert on records BEGIN
 insert into sync_receipts(operation_id,created_at) values(new.operation_id,datetime('now'));
 insert into changes(entity,entity_id,payload) values(new.entity,new.id,new.payload);
END;
create trigger if not exists records_update after update on records BEGIN
 insert into sync_receipts(operation_id,created_at) values(new.operation_id,datetime('now'));
 insert into changes(entity,entity_id,payload) values(new.entity,new.id,new.payload);
END;
insert or ignore into records select 'book',id,json_object('id',id,'title',title,'author',author,'isbn',isbn,'coverUrl',cover_url,'publisher',publisher,'year',year,'source',source,'notes',notes,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at,'version',version,'writeOrder',0),'{}',version,'migration-book-'||id from books;
insert or ignore into records select 'highlight',id,json_object('id',id,'bookId',book_id,'text',text,'note',note,'pageNumber',page_number,'location',location,'chapter',chapter,'source',source,'sourceImage',source_image,'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at,'version',version,'writeOrder',0),'{}',version,'migration-highlight-'||id from highlights;
create table if not exists scan_results(id text primary key, book_id text not null, image_hash text not null, result text, created_at integer not null);
