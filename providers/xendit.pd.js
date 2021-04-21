const url = require('url')
, router=require('express').Router()
, bodyParser =require('body-parser')
, getDB=require('../db.js')
, {ObjectId} =require('mongodb')
, {confirmOrder, updateOrder, getOrderDetail} =require('../order.js')
, {dec2num, dedecaimal}=require('../etc.js')
, httpf =require('httpf')
, fetch=require('node-fetch')
, path =require('path')
, argv=require('yargs').argv
, debugout=require('debugout')(argv.debugout)
, crypto=require('crypto')
, querystring=require('querystring')
, Xendit = require('xendit-node')
, x=new Xendit({
    // formal key
    secretKey:'xnd_production_ZB6efUZYgjocx85aMXfbcL0XgcNJUks3CntYyeNakwUEvs0082hjgt3bxLoNR'
    // test key
    // secretKey:'xnd_development_4e79IP5rPlpvC7BPcEjMyfqxPeTNAGD9NXLCazd5j48F7U2XdOyKvRI1M1StMh5'
})
, {Invoice, Disbursement, Balance} =x
, xendit_i=new Invoice({})
, xendit_d=new Disbursement({})
, xendit_b=new Balance({})

const _noop=function() {};

exports.bestSell=null;
exports.sell=_noop;
exports.bestPair=(money, cb)=>{
	return cb(null, -1, 'IDR');
};
exports.name='xendit';
exports.router=router;
exports.supportedMethods=['creditCards', 'va', 'eWallet', 'retailOutlets', 'QRCodes'];

Number.prototype.pad = function(size) {
	var s = String(this);
	while (s.length < (size || 2)) {s = "0" + s;}
	return s;
}

const datestring=(t) =>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getFullYear().pad(4)}${(t.getMonth()+1).pad()}${t.getDate().pad()}`;
}
const yyyymmddtimestring =(t)=>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getFullYear().pad(4)}-${(t.getMonth()+1).pad()}-${t.getDate().pad()} ${t.getHours().pad()}:${t.getMinutes().pad()}:${t.getSeconds().pad()}`;
}
const timestring =(t)=>{
	if (!t) t=new Date();
	else if (!(t instanceof Date)) t=new Date(t);
	return `${t.getDate().pad()}/${(t.getMonth()+1).pad()}/${t.getFullYear().pad(4)} ${t.getHours().pad()}:${t.getMinutes().pad()}:${t.getSeconds().pad()}`;
}

router.all('/return', (req, res)=>{
    res.send('everything is done');
})

router.all('/done', bodyParser.json(), async function (req, res) {
    debugout('recharge notify', req.body);
    var {external_id:orderId, id:providerOrderId, amount, status}=req.body;
    amount=Number(amount);
    try {
        var {db}=await getDB();
        var {matchedCount}=await db.bills.updateOne({_id:ObjectId(orderId), used:{$ne:true}}, {$set:{providerOrderId}}, {w:1});
        if (matchedCount==0) throw 'Invalid external_id';
        await confirmOrder(orderId, amount);
        return res.send({result:'ok'});
    } catch(e) {
        return res.status(500).send({err:(typeof e==='object'?e.message:e)});
    }
});

router.all('/disburse_result', bodyParser.json(), async function(req, res) {
    debugout('disburse notify', req.body);
    var {external_id:orderId, status, amount, id:providerOrderId}=req.body;
    amount=Number(amount);
    try {
        var {db}=await getDB();
        var {matchedCount}=await db.bills.updateOne({_id:ObjectId(orderId), paymentMethod:'disbursement', used:{$ne:true}}, {$set:{paidmoney:amount, providerOrderId, status, used:true}}, {w:1});
        if (matchedCount==0) throw 'Invalid external_id';
        return res.send({result:'ok'});
    } catch(e) {
        return res.status(500).send({err:(typeof e==='object'?e.message:e)});
    }
});

var forwardOrder =async function(params, callback) {
	callback=callback||function(err, r) {
		if (err) throw err;
		return r;
	}

    var {orderId:externalID, money:amount, email:payerEmail='userrefused@to.provide', desc:description='Default goods', return_url, _host} =params;
    try {
        var result=await xendit_i.createInvoice({externalID, amount, payerEmail, description, currency:'IDR', successRedirectURL:return_url||(_host+'pvd/xendit/return')});
		updateOrder(params.orderId, {status:'待支付', lasttime:new Date(), xendit_ret:result});
		var ret={url:result.invoice_url};
		ret.pay_type=params.type;
        ret.providerOrderId=result.id;
		return callback(null, ret);
    } catch(e) {
		return callback(e.message);
	}
}

exports.forwardOrder=forwardOrder;

exports.getBalance=async function() {
    var [vb, vr]=await Promise.allSettled([
        xendit_b.getBalance({accountType:Balance.AccountType.Cash}),
        xendit_b.getBalance({accountType:Balance.AccountType.Holding})
    ]);
    return {err:vb.reason||vr.reason, balance:vb.value.balance||0, receivable:vr.value.balance};
}

const supportedBanks={
'BPD Aceh':'ACEH',
'BPD Aceh UUS':'ACEH_UUS',
'Bank Agris':'AGRIS',
'Bank BRI Agroniaga':'AGRONIAGA',
'Bank Amar Indonesia (formerly Anglomas International Bank)':'AMAR',
'Bank ANZ Indonesia':'ANZ',
'Bank Arta Niaga Kencana':'ARTA_NIAGA_KENCANA',
'Bank Artha Graha International':'ARTHA',
'Bank Artos Indonesia':'ARTOS',
'BPD Bali':'BALI',
'Bank of America Merill-Lynch':'BAML',
'Bangkok Bank':'BANGKOK',
'BPD Banten (formerly Bank Pundi Indonesia)':'BANTEN',
'Bank Central Asia (BCA)':'BCA',
'Bank Central Asia (BCA) Syariah':'BCA_SYR',
'BPD Bengkulu':'BENGKULU',
'Bank Bisnis Internasional':'BISNIS_INTERNASIONAL',
'Bank BJB':'BJB',
'Bank BJB Syariah':'BJB_SYR',
'Bank Negara Indonesia (BNI)':'BNI',
'Bank BNI Syariah':'BNI_SYR',
'Bank BNP Paribas':'BNP_PARIBAS',
'Bank of China (BOC)':'BOC',
'Bank Rakyat Indonesia (BRI)':'BRI',
'Bank Syariah BRI':'BRI_SYR',
'Bank Tabungan Negara (BTN)':'BTN',
'Bank Tabungan Negara (BTN) UUS':'BTN_UUS',
'BTPN Syariah (formerly Bank Sahabat Purba Danarta and Bank Tabungan Pensiunan Nasional UUS)':'BTPN_SYARIAH',
'Bank Bukopin':'BUKOPIN',
'Bank Syariah Bukopin':'BUKOPIN_SYR',
'Bank Bumi Arta':'BUMI_ARTA',
'Bank Capital Indonesia':'CAPITAL',
'China Construction Bank Indonesia (formerly Bank Antar Daerah and Bank Windu Kentjana International)':'CCB',
'Centratama Nasional Bank':'CENTRATAMA',
'Bank Chinatrust Indonesia':'CHINATRUST',
'Bank CIMB Niaga':'CIMB',
'Bank CIMB Niaga UUS':'CIMB_UUS',
'Citibank':'CITIBANK',
'Bank Commonwealth':'COMMONWEALTH',
'BPD Daerah Istimewa Yogyakarta (DIY)':'DAERAH_ISTIMEWA',
'BPD Daerah Istimewa Yogyakarta (DIY) UUS':'DAERAH_ISTIMEWA_UUS',
'Bank Danamon':'DANAMON',
'Bank Danamon UUS':'DANAMON_UUS',
'Bank DBS Indonesia':'DBS',
'Deutsche Bank':'DEUTSCHE',
'Bank Dinar Indonesia':'DINAR_INDONESIA',
'Bank DKI':'DKI',
'Bank DKI UUS':'DKI_UUS',
'Indonesia Eximbank (formerly Bank Ekspor Indonesia)':'EXIMBANK',
'Bank Fama International':'FAMA',
'Bank Ganesha':'GANESHA',
'Bank Hana':'HANA',
'Bank Harda Internasional':'HARDA_INTERNASIONAL',
'Hongkong and Shanghai Bank Corporation (HSBC) (formerly Bank Ekonomi Raharja)':'HSBC',
'Bank ICBC Indonesia':'ICBC',
'Bank Ina Perdania':'INA_PERDANA',
'Bank Index Selindo':'INDEX_SELINDO',
'Bank of India Indonesia':'INDIA',
'BPD Jambi':'JAMBI',
'BPD Jambi UUS':'JAMBI_UUS',
'Bank Jasa Jakarta':'JASA_JAKARTA',
'BPD Jawa Tengah':'JAWA_TENGAH',
'BPD Jawa Tengah UUS':'JAWA_TENGAH_UUS',
'BPD Jawa Timur':'JAWA_TIMUR',
'BPD Jawa Timur UUS':'JAWA_TIMUR_UUS',
'JP Morgan Chase Bank':'JPMORGAN',
'Bank JTrust Indonesia (formerly Bank Mutiara)':'JTRUST',
'BPD Kalimantan Barat':'KALIMANTAN_BARAT',
'BPD Kalimantan Barat UUS':'KALIMANTAN_BARAT_UUS',
'BPD Kalimantan Selatan':'KALIMANTAN_SELATAN',
'BPD Kalimantan Selatan UUS':'KALIMANTAN_SELATAN_UUS',
'BPD Kalimantan Tengah':'KALIMANTAN_TENGAH',
'BPD Kalimantan Timur':'KALIMANTAN_TIMUR',
'BPD Kalimantan Timur UUS':'KALIMANTAN_TIMUR_UUS',
'Bank Kesejahteraan Ekonomi':'KESEJAHTERAAN_EKONOMI',
'BPD Lampung':'LAMPUNG',
'BPD Maluku':'MALUKU',
'Bank Mandiri':'MANDIRI',
'Bank Syariah Mandiri':'MANDIRI_SYR',
'Mandiri Taspen Pos (formerly Bank Sinar Harapan Bali)':'MANDIRI_TASPEN',
'Bank Maspion Indonesia':'MASPION',
'Bank Mayapada International':'MAYAPADA',
'Bank Maybank (formerly BII)':'MAYBANK',
'Bank Maybank Syariah Indonesia':'MAYBANK_SYR',
'Bank Mayora':'MAYORA',
'Bank Mega':'MEGA',
'Bank Syariah Mega':'MEGA_SYR',
'Bank Mestika Dharma':'MESTIKA_DHARMA',
'Bank Mitra Niaga':'MITRA_NIAGA',
'Bank Sumitomo Mitsui Indonesia':'MITSUI',
'Bank Mizuho Indonesia':'MIZUHO',
'Bank MNC Internasional':'MNC_INTERNASIONAL',
'Bank Muamalat Indonesia':'MUAMALAT',
'Bank Multi Arta Sentosa':'MULTI_ARTA_SENTOSA',
'Bank Nationalnobu':'NATIONALNOBU',
'BPD Nusa Tenggara Barat':'NUSA_TENGGARA_BARAT',
'BPD Nusa Tenggara Barat UUS':'NUSA_TENGGARA_BARAT_UUS',
'BPD Nusa Tenggara Timur':'NUSA_TENGGARA_TIMUR',
'Bank Nusantara Parahyangan':'NUSANTARA_PARAHYANGAN',
'Bank OCBC NISP':'OCBC',
'Bank OCBC NISP UUS':'OCBC_UUS',
'Bank Oke Indonesia (formerly Bank Andara)':'OKE',
'Bank Panin':'PANIN',
'Bank Panin Syariah':'PANIN_SYR',
'BPD Papua':'PAPUA',
'Bank Permata':'PERMATA',
'Bank Permata UUS':'PERMATA_UUS',
'Prima Master Bank':'PRIMA_MASTER',
'Bank QNB Indonesia (formerly Bank QNB Kesawan)':'QNB_INDONESIA',
'Bank Rabobank International Indonesia':'RABOBANK',
'Royal Bank of Scotland (RBS)':'RBS',
'Bank Resona Perdania':'RESONA',
'BPD Riau Dan Kepri':'RIAU_DAN_KEPRI',
'BPD Riau Dan Kepri UUS':'RIAU_DAN_KEPRI_UUS',
'Bank Royal Indonesia':'ROYAL',
'Bank Sahabat Sampoerna':'SAHABAT_SAMPOERNA',
'Bank SBI Indonesia':'SBI_INDONESIA',
'Bank Shinhan Indonesia (formerly Bank Metro Express)':'SHINHAN',
'Sinarmas':'SINARMAS',
'Bank Sinarmas UUS':'SINARMAS_UUS',
'Standard Charted Bank':'STANDARD_CHARTERED',
'BPD Sulawesi Tengah':'SULAWESI',
'BPD Sulawesi Tenggara':'SULAWESI_TENGGARA',
'BPD Sulselbar':'SULSELBAR',
'BPD Sulselbar UUS':'SULSELBAR_UUS',
'BPD Sulut':'SULUT',
'BPD Sumatera Barat':'SUMATERA_BARAT',
'BPD Sumatera Barat UUS':'SUMATERA_BARAT_UUS',
'BPD Sumsel Dan Babel':'SUMSEL_DAN_BABEL',
'BPD Sumsel Dan Babel UUS':'SUMSEL_DAN_BABEL_UUS',
'BPD Sumut':'SUMUT',
'BPD Sumut UUS':'SUMUT_UUS',
'Bank Tabungan Pensiunan Nasional':'TABUNGAN_PENSIUNAN_NASIONAL',
'Bank of Tokyo Mitsubishi UFJ':'TOKYO',
'Gopay':'GOPAY',
'OVO':'OVO',
'DANA':'DANA',
'LinkAja':'LINKAJA',
'Shopeepay':'SHOPEEPAY',
};

exports.disburse =async function withdrawal(orderId, bank, owner, account, money) {
    var bankCode=supportedBanks[bank];
    if (!bankCode) throw 'not supported bank'
    var ret=await xendit_d.create({
        externalID: orderId,
        bankCode: supportedBanks[bank],
        accountHolderName: owner,
        accountNumber: account,
        description: 'Payment for '+owner,
        amount: money,
    })
    return ret.id;
}

if (module===require.main) {
    (async ()=>{
        console.log(await exports.disburse(new ObjectId().toHexString(), 'Bank Central Asia (BCA)', 'fangziling', '7180318962', 50));
    })()
}
