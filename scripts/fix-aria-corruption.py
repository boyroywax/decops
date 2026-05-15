#!/usr/bin/env python3
import re, glob, sys

files = glob.glob('src/**/*.tsx', recursive=True)

pat_quoted = re.compile(r'(\bon[A-Za-z]+=\{[^}]*?)=\s+aria-label="([^"]*?)">\s*')
pat_brace = re.compile(r'(\bon[A-Za-z]+=\{[^}]*?)=\s+aria-label=\{')

total = 0
for f in files:
    src = open(f).read()
    orig = src

    # quoted aria-label
    while True:
        m = pat_quoted.search(src)
        if not m:
            break
        before = m.group(1)
        aria_val = m.group(2)
        replacement = f'{before}=> '
        src = src[:m.start()] + replacement + src[m.end():]
        i = m.start() + len(replacement)
        depth = 1
        while i < len(src) and depth > 0:
            c = src[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            i += 1
        src = src[:i] + f' aria-label="{aria_val}"' + src[i:]
        total += 1

    # brace-valued aria-label
    while True:
        m = pat_brace.search(src)
        if not m:
            break
        before = m.group(1)
        i = m.end()  # right after the `{`
        depth = 1
        while i < len(src) and depth > 0:
            c = src[i]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            i += 1
        aria_expr = src[m.end():i-1]
        after = src[i:]
        m2 = re.match(r'>\s*', after)
        if not m2:
            break
        replacement = f'{before}=> '
        src = src[:m.start()] + replacement + after[m2.end():]
        i2 = m.start() + len(replacement)
        depth = 1
        while i2 < len(src) and depth > 0:
            c = src[i2]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            i2 += 1
        src = src[:i2] + f' aria-label={{{aria_expr}}}' + src[i2:]
        total += 1

    if src != orig:
        open(f, 'w').write(src)
        print(f'fixed {f}')

print(f'TOTAL fixes: {total}')
