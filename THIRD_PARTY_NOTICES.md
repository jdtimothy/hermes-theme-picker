# Third-Party Notices

This project bundles skin palettes from two MIT-licensed upstream projects.
The Theme Picker code itself is an original implementation and is licensed
under the MIT License (see `LICENSE`); the bundled `skins/*.yaml` files are
the unmodified work of their respective authors and are redistributed here
under the terms of their MIT licenses, reproduced below.

## Bundled skins

| Source | Skins included | License |
|---|---|---|
| [BChop's Hermes Skins Pack](https://github.com/bchop-studio/hermes-skins-pack) | 50 original designs; 40 exclusive files plus 10 designs updated in CliffWade's pack | MIT |
| [CliffWade's Hermes Desktop Theme Pack](https://github.com/CliffWade/hermes-desktop-theme-pack) | 100 skins from v1.1.0 | MIT |

The two sources overlap on 10 theme names, so the repository contains 140
unique YAML files rather than 150. For those overlapping names, this project
ships the current files from CliffWade's v1.1.0 pack.
Their byte identity is enforced by `scripts/cliffwade-v1.1.0-sha256.json` and
the generator test suite.

The Hermes Desktop Theme Pack also served as the initial inspiration for this
project's theme-switcher concept; no code from it is included.

## MIT License — Copyright (c) 2026 BChop

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## MIT License — Copyright (c) 2026 Cliff Wade

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
