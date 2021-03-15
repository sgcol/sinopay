const {createDriver, keepOrignId, objectId}=require('./dataDrivers.js')

module.exports={
	users: createDriver('users'),
	recon: require('./recon'),
	providers: require('./providers'),
	bills: require('./bills'),
	billsSummary :require('./billsSummary'),
	tags: require('./providers'),
	statements:require('./statements'),
	statementsSummary :require('./statementsSummary.js')
}