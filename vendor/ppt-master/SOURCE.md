# Vendored Image Components

Source: hugohe3/ppt-master, cloned commit `bf89859`.

Copied components: `scripts/image_gen.py` and `scripts/image_backends/`.
They retain the upstream behavior, licenses, and provider-specific adapters.
No provider compatibility or model availability is guaranteed without a live
test against the user's chosen endpoint.

Host adapters `config.py` and `console_encoding.py` are Video Master
implementations: project-local `.env` only and UTF-8 output with no raw
transcript file. They do not present this bundle as PPT Master's official
distribution. The complete original distribution remains unmodified in the
workspace's separate `reference/ppt-master` clone.
