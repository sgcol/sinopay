console.log('select config qiufeng');

module.exports={
    locale:'CN',
    language:'zh-cn',
    providers:['sandpay', 'dreamyun'],
    defaultShare:{
        default:{
            mdr:0.02, fix_fee:0
        },
        disbursement:{
            mdr:0, fix_fee:5
        }
    },
}