module.exports={
    locale:'ID',
    lanuage:'en',
    providers:['xendit', 'midtrans', 'espay'],
    defaultShare:{
        creditCard:{
            mdr:0.03, fix_fee:5000
        },
        eWallet:{
            mdr:0.028, fix_fee:0
        },
        va:{
            mdr:0, fix_fee:7500
        },
        retailOutlets:{
            mdr:0, fix_fee:8500
        },
        disbursement:{
            mdr:0, fix_fee:7500
        }
    }
}