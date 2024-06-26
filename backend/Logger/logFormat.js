const logFormat = (req, res) => {
    return {
        host: req.headers.host,
        method: req.method,
        url: req.url,
        userId: res.userId,
        emailId: res.emailId,
        statusCode: res.statusCode,
        responseTime: res.responsetime,
        ipAddress: req.ip,
    }
}

module.exports = logFormat;