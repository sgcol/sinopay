const MongoOplog =require( 'mongo-oplog')
const oplog = MongoOplog('mongodb://127.0.0.1/local', {ns:'mill.bills'})
 
oplog.tail();
 
// oplog.on('op', data => {
//   console.log(data);
// });
 
oplog.on('insert', doc => {
  console.log(doc);
});
 
oplog.on('update', doc => {
  console.log(doc);
});
 
oplog.on('delete', doc => {
  console.log(doc.o._id);
});
 
oplog.on('error', error => {
  console.log(error);
});
 
oplog.on('end', () => {
  console.log('Stream ended');
  oplog.tail();
});
 
oplog.stop(() => {
  console.log('server stopped');
});