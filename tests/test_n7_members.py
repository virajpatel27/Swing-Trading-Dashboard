"""Phase N7: members of the main NSE indices for the heatmap page."""
from swingdash import index_members as im

CSV = "Company Name,Industry,Symbol,Series,ISIN Code\n" + "\n".join(f"Co {i},X,SYM{i},EQ,INE{i:05d}" for i in range(60))


class _R:
    def __init__(self, code, text=""):
        self.status_code, self.content = code, text.encode()


class _Http:
    def __init__(self, fail=()):
        self.fail = set(fail)

    def get(self, url, **kw):
        name = url.rsplit("/", 1)[1]
        if name in self.fail:
            return _R(404)
        n = {"ind_niftybanklist.csv": 12}.get(name, 0)
        exp = next(e for _, _, f, e in im.INDEXES if f == name)
        rows = CSV.splitlines()[: 1 + max(exp, n)] if exp <= 60 else [CSV.splitlines()[0]] + [f"Co {i},X,S{i},EQ,I{i}" for i in range(exp)]
        return _R(200, "\n".join(rows))


def test_parse_symbols():
    assert im.parse(CSV.encode())[:2] == ["SYM0", "SYM1"]
    assert len(im.parse(CSV.encode())) == 60


def test_update_writes_and_keeps_old_list_on_failure(tmp_path):
    r = im.update(tmp_path, _Http(), log=lambda *a: None)
    assert r["indices"] == len(im.INDEXES) and r["changed"] and not r["kept_old"]
    assert im.update(tmp_path, _Http(), log=lambda *a: None)["changed"] is False
    r2 = im.update(tmp_path, _Http(fail={"ind_nifty50list.csv"}), log=lambda *a: None)
    assert r2["kept_old"] and r2["changed"] is False                     # Nifty 50 kept from the saved file
    pay = im.site_payload(tmp_path)
    assert len(pay["NIFTY_50"]["symbols"]) == 50 and pay["NIFTY_50"]["name"] == "Nifty 50"


def test_short_list_is_rejected(tmp_path):
    class Short(_Http):
        def get(self, url, **kw):
            return _R(200, "\n".join(CSV.splitlines()[:5]))
    r = im.update(tmp_path, Short(), log=lambda *a: None)
    assert r["rows"] == 0 and len(r["kept_old"]) == len(im.INDEXES)
    assert not im.path(tmp_path).exists()
