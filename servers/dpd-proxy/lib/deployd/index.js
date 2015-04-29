var deployd = require('deployd');

var createDeploydServer = function(options) {
	var dpd = deployd(options);

	dpd.listen();

	console.log('Deployd is running on port ' + options.port);
}

module.exports = createDeploydServer;