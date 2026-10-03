# Fixtures

Real camera RAW files used by integration tests. They are too large for git;
run `npm run fixtures` to download and SHA-256-verify them (idempotent).
Tests that need a missing file are skipped, not failed.

All files come from [raw.pixls.us](https://raw.pixls.us) and are licensed
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File                | Format | Camera                  | Source path (under `raw.pixls.us/data/`) |
| ------------------- | ------ | ----------------------- | ---------------------------------------- |
| `leica-m8.dng`      | DNG    | Leica M8                | `Leica/M8/L1030132.DNG`                  |
| `sony-a100.arw`     | ARW    | Sony DSLR-A100          | `Sony/DSLR-A100/_DSC0258.ARW`            |
| `nikon-d70.nef`     | NEF    | Nikon D70               | `Nikon/D70/20170902_0047.NEF`            |
| `canon-350d.cr2`    | CR2    | Canon EOS 350D          | `Canon/EOS 350D/IMG_1707.CR2`            |
| `olympus-e1.orf`    | ORF    | Olympus E-1             | `Olympus/E-1/E_1__C106743_gredos.ORF`    |
| `panasonic-lx3.rw2` | RW2    | Panasonic Lumix DMC-LX3 | `Panasonic/DMC-LX3/Lumix_LX3_16_9.rw2`   |

Hashes live in `manifest.json`.
