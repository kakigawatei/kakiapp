# -*- coding: utf-8 -*-
import io
P = "index.html"
s = io.open(P, encoding="utf-8").read()
old = s[s.index('      <ol style="text-align:left;font-size:13px'):s.index('      <p class="muted" style="font-size:11px;color:#cfd6e6')]
new = '''      <ol style="text-align:left;font-size:13px;line-height:1.6;margin:0 0 10px;padding-left:20px">
        <li>食券は買わずに、この画面をスタッフに見せる</li>
        <li>「アプリで並盛」のように口頭で注文する</li>
      </ol>
'''
s = s.replace(old, new)
s = s.replace('引換券（券売機の前で）', '引換券（見せて注文）')
s = s.replace('kakiConfirm("券売機の前で押してください。', 'kakiConfirm("注文するときに押してください。')
s = s.replace('logTx("券売機で交換 " + nm', 'logTx("お店で交換 " + nm')
assert '見せて注文' in s and '口頭で注文' in s and '注文するときに押して' in s and 'お店で交換 ' in s
io.open(P, "w", encoding="utf-8").write(s)
print("ok")
