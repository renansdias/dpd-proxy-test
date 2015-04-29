var initiate = require('./proxy');

/**
 * Creates a new proxy server that forwards some requests to
 * the dpd server.
 *
 * options should be an object with the following properties:
 *
 * - port (port for the proxy server)
 * - resourcesDirectory (Directory where the resources folder will be at)
 */
var createProxyServerForDpd = function(options) {
	options.port = (typeof options.port === 'undefined') ? (3434) : (options.port);

	if (typeof options.resourcesDirectory === 'undefined') {
		throw new Error('Please, provide the directory of the resources folder');
	}

	initiate(options);
}

exports.createProxyServerForDpd = createProxyServerForDpd;