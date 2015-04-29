var path = require('path');
var dpdProxy = require('./servers/dpd-proxy');

dpdProxy.createProxyServerForDpd({
	port: 3434,
	resourcesDirectory: path.join(__dirname, 'resources')
});