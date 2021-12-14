const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5000;

const upstream = 'https://nhentai.com';

const matchKey = 'nhentai';

const proxyPart = 'nh_p_path/';

const upstream_path = '/';

app.get('*', function (request, res) {
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

    let upstream_domain = url.host;

    let method = request.method;
    let new_request_headers = request.headers;

    new_request_headers.host = url.host;
    new_request_headers.referer = "";

    let connection_upgrade = new_request_headers.upgrade;

    proxyReq(method, url.href, new_request_headers, connection_upgrade, upstream_domain, url_hostname, res);
})

function incomeHeaderToMap(header) {
    return new Map(Object.entries(JSON.parse(JSON.stringify(header))))
}

function proxyReq(method, url, headers, connection_upgrade, upstream_domain, url_hostname, res) {
    console.log(method + "\n" + url + "\n" + headers);
    axios({method : method,
    url : url,
    headers : headers}).then(function (original_response) {
        console.log(JSON.stringify(original_response.data))
        if (connection_upgrade && connection_upgrade.toLowerCase() === "websocket") {
            res.sendStatus(original_response.status);
            res.set(original_response.headers);
            res.send(original_response.data);
        }

        let original_text;
        let new_response_headers = incomeHeaderToMap(original_response.headers);
        let status = original_response.status;

        new_response_headers.set('access-control-allow-origin', '*');
        new_response_headers.set('access-control-allow-credentials', true);
        new_response_headers.delete('content-security-policy');
        new_response_headers.delete('content-security-policy-report-only');
        new_response_headers.delete('clear-site-data');

        if (new_response_headers.get("x-pjax-url")) {
            new_response_headers.set("x-pjax-url", new_response_headers.get("x-pjax-url").replace("//" + upstream_domain, "//" + url_hostname));
        }


        const content_type = new_response_headers.get('content-type');
        if (content_type != null && content_type.includes('text/html')) {
            original_text = replace_response_text(original_response, upstream_domain, url_hostname);
        } else {
            original_text = original_response.data
        }

        setExpressHeaders(res, new_response_headers);
        console.log(original_text);
        res.status(status).end(original_text);
    }).catch(e =>{
        console.error(e);
    });
}

function setExpressHeaders(res, headers) {
    headers.forEach((k, v) =>{
        try {
            res.set(k, v);
        }
        catch (e) {

        }
    })
}

function replace_response_text(response, upstream_domain, host_name) {
    let text = response.data;

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

let server = app.listen(PORT, function () {

    let host = server.address().address;
    let port = server.address().port;

    console.log("listen on http://%s:%s", host, port)

})
