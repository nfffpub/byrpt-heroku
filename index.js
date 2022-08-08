const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 8100;
const HOST = process.env.IP || "0.0.0.0";

const upstream = 'https://byr.pt';

const matchKey = 'byr.pt';

const proxyPart = 'pt_path/';

const upstream_path = '/';

app.get('*', function (request, res) {
    proxyHandler(request,res);
})

app.post('*', function (request, res) {
    proxyHandler(request,res);
})

function proxyHandler(request, res) {
    let reqUrl = "https://" + request.headers.host + request.url;
    let reqUrlObj = new URL(reqUrl);
    let url_hostname = reqUrlObj.host;
    let reqUrlPart = reqUrl.split(proxyPart);
    let url;
    if (reqUrlPart.length !== 2) {
        if (reqUrlObj.pathname === '/') {
            url = new URL(upstream_path, upstream);
        } else {
            reqUrlObj.host = new URL(upstream).host;
            url = reqUrlObj;
        }
    } else {
        url = new URL(decodeURIComponent(reqUrlPart[1]));
    }

    let referURl = '';
    let origin_referer = request.headers.referer;
    if (origin_referer) {
        let refererUrlPart = origin_referer.split(proxyPart);
        if (refererUrlPart.length === 2) {
            referURl = new URL(decodeURIComponent(reqUrlPart[1])).href;
        }
    }

    let upstream_domain = url.host;

    let method = request.method;
    //let new_request_headers = request.headers;
    let new_request_headers = {
        'Accept' : request.headers.accept ? request.headers.accept : '',
        'Accept-Language' : request.headers["accept-language"] ? request.headers["accept-language"] : '',
        'Host' : url.host,
        'Referer' : referURl,
        'Cookie' : request.headers.cookie ? request.headers.cookie : '',
        'Connection' : request.headers.connection ? request.headers.connection : '',
        'User-Agent' : request.headers["user-agent"] ? request.headers["user-agent"] : ''
    };

    //new_request_headers.host = url.host;
    //new_request_headers.referer = "";

    let connection_upgrade = new_request_headers.upgrade;

    proxyReq(method, url.href, new_request_headers, connection_upgrade, upstream_domain, url_hostname, res);
}

function proxyReq(method, url, headers, connection_upgrade, upstream_domain, url_hostname, res) {
    console.log(method + " " + url + " " + JSON.stringify(headers));
    axios({
        method: method,
        url: url,
        headers: headers,
        responseType: 'arraybuffer'
    }).then(function (original_response) {
        if (connection_upgrade && connection_upgrade.toLowerCase() === "websocket") {
            setExpressHeaders(res, original_response.headers);
            res.status(original_response.status).end(original_response.data);
        }

        let original_text;
        let new_response_headers = original_response.headers;
        let status = original_response.status;
        console.log(original_response);

        new_response_headers['access-control-allow-origin'] = '*';
        new_response_headers['access-control-allow-credentials'] = true;
        new_response_headers['content-security-policy'] = undefined;
        new_response_headers['content-security-policy-report-only'] = undefined;
        new_response_headers['clear-site-data'] = undefined;

        if (new_response_headers["x-pjax-url"] !== undefined) {
            new_response_headers["x-pjax-url"] = new_response_headers["x-pjax-url"].replace("//" + upstream_domain, "//" + url_hostname);
        }


        const content_type = new_response_headers['content-type'];
        if (content_type != null && content_type.includes('text/html')) {
            original_text = replace_response_text(original_response, upstream_domain, url_hostname);
        } else {
            original_text = original_response.data;
        }

        setExpressHeaders(res, new_response_headers);
        res.status(status).end(original_text);

    }).catch(e => {
        console.error(e);
    });
}

function setExpressHeaders(res, headers) {
    Object.entries(headers).forEach((k) => {
        try {
            res.set(k[0], k[1]);
        } catch (e) {

        }
    })
}

function replace_response_text(response, upstream_domain, host_name) {
    let text = new TextDecoder("utf-8").decode(response.data);

    function convert(match) {
        if (match.includes(matchKey)) {
            return "https://" + host_name + "/" + proxyPart + match;
        }
        return match;
    }

    let re = new RegExp('(https?|ftp|file)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]', 'g')
    text = text.replace(re, convert);

    return text;
}

let server = app.listen(PORT, HOST, function () {

    let host = server.address().address;
    let port = server.address().port;

    console.log("listen on http://%s:%s", host, port)

})
