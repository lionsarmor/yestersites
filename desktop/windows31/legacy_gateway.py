"""Serve one public YesterSites member's classic edition to a local vintage browser."""
import argparse
import hashlib
import html
import re
import threading
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

# Mosaic 1.0 understands the Latin alphabet but predates Unicode punctuation and HTML4 entities.
CLASSIC_PUNCTUATION = str.maketrans({
    "‘": "'", "’": "'", "‚": ",", "“": '"', "”": '"', "„": '"',
    "–": "-", "—": "--", "…": "...", "·": "*", "•": "*", "\u00a0": " ",
})

DEFAULT_SITE = 'roddy-aircheck-1121'
LIMIT = 8 * 1024 * 1024


def member_origin(slug):
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or len(slug) > 40:
        raise ValueError('Use the member name, for example roddy-aircheck-1121.')
    return 'https://' + slug + '.yestersites.com'


class SameMember(HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = origin

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith(self.origin + '/'):
            raise HTTPError(newurl, 502, 'Page redirected outside this member site', headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ClassicHTML(HTMLParser):
    def __init__(self, source_url, local_name):
        super().__init__(convert_charrefs=False)
        self.source_url = source_url
        self.local_name = local_name
        self.parts = []
        self.script = False

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.script = True
            return
        if self.script:
            return
        start = ['<' + tag]
        for name, value in attrs:
            if name.startswith('on'):
                continue
            if value is None:
                start.append(name)
                continue
            if name in ('src', 'href', 'background', 'action', 'poster') and value and not value.startswith('#'):
                value = self.local_name(urljoin(self.source_url, value), name)
            start.append(name + '="' + html.escape(value, quote=True) + '"')
        self.parts.append(' '.join(start) + '>')

    def handle_endtag(self, tag):
        if tag == 'script':
            self.script = False
        elif not self.script:
            self.parts.append('</' + tag + '>')

    def handle_data(self, data):
        if not self.script:
            self.parts.append(data.translate(CLASSIC_PUNCTUATION))

    def handle_entityref(self, name):
        self.classic_entity('&' + name + ';')

    def handle_charref(self, name):
        self.classic_entity('&#' + name + ';')

    def classic_entity(self, original):
        decoded = html.unescape(original)
        replacement = decoded.translate(CLASSIC_PUNCTUATION)
        # Preserve escapes that keep HTML text distinct from markup.
        self.handle_data(replacement if replacement != decoded else original)

    def handle_decl(self, decl):
        self.handle_data('<!' + decl + '>')


class Gateway(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, site, port, log=None):
        self.origin = member_origin(site)
        self.aliases = {'/INDEX.HTM': '/classic.html', '/BBS.HTM': '/bbs/', '/TEXT.HTM': '/text.html', '/TERMINAL.TXT': '/terminal.txt'}
        self.lock = threading.Lock()
        self.opener = build_opener(SameMember(self.origin))
        self.report = log
        super().__init__(('127.0.0.1', port), Handler)

    def local_name(self, url, attr):
        if not url.startswith(self.origin + '/'):
            return url
        parts = urlsplit(url)
        remote = urlunsplit(('', '', parts.path, parts.query, ''))
        _, dot, extension = parts.path.rsplit('/', 1)[-1].rpartition('.')
        ext = extension.upper() if dot else ''
        if ext == 'JPEG':
            ext = 'JPG'
        if ext in ('HTML', 'HTM') or parts.path.endswith('/'):
            ext = 'HTM'
        elif not re.fullmatch('[A-Z0-9]{1,3}', ext):
            ext = 'GIF' if attr in ('src', 'background', 'poster') else 'DAT'
        with self.lock:
            if remote == '/classic.html':
                alias = '/INDEX.HTM'
            else:
                # Avoid Mosaic's filename-length limit and collisions across revision IDs.
                suffix = 0
                while True:
                    digest = hashlib.sha256((remote + '#' + str(suffix)).encode()).hexdigest()
                    alias = '/' + digest[:8].upper() + '.' + ext
                    if self.aliases.get(alias, remote) == remote:
                        break
                    suffix += 1
                self.aliases[alias] = remote
        return alias[1:] + ('#' + parts.fragment if parts.fragment else '')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if not self.path.startswith('/') or self.path.startswith('//'):
            self.send_error(400)
            return
        with self.server.lock:
            path = self.server.aliases.get(self.path.upper())
        if path is None:
            self.send_error(404, 'Open /INDEX.HTM to enter this site')
            return
        try:
            request = Request(self.server.origin + path, headers={'User-Agent':'YesterSites-Classic/1.0'})
            with self.server.opener.open(request, timeout=15) as res:
                raw = res.read(LIMIT + 1)
                if len(raw) > LIMIT:
                    self.send_error(413, 'File exceeds 8 MiB')
                    return
                data = raw
                mime = res.headers.get_content_type()
                if mime == 'text/html':
                    parser = ClassicHTML(res.geturl(), self.server.local_name)
                    parser.feed(raw.decode(res.headers.get_content_charset() or 'utf-8', 'replace'))
                    parser.close()
                    data = ''.join(parser.parts).encode('ascii', 'xmlcharrefreplace')
                if self.server.report:
                    self.server.report(res.geturl(), res.status, mime, len(raw))
                self.send_response(res.status)
                self.send_header('Content-Type', mime)
                if res.headers.get('Content-Disposition'):
                    self.send_header('Content-Disposition', res.headers['Content-Disposition'])
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as error:
            self.send_error(error.code, 'Member resource unavailable')
        except (OSError, ValueError):
            self.send_error(502, 'Unable to fetch this member page over HTTPS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('site', nargs='?', default=DEFAULT_SITE)
    parser.add_argument('--port', type=int, default=8077)
    args = parser.parse_args()
    with Gateway(args.site, args.port) as server:
        print(f'Open http://10.0.2.2:{server.server_port}/INDEX.HTM in DOSBox-X (SLIRP).', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
