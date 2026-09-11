# An update is not a loaded extension

We updated `skill-harness`, opened Pi, and still had no `/skill-harness` command.

Nothing mysterious happened. The npm meta-package shipped the CLI and declared no Pi resources. The extension bundle existed in the repository, was tested there, and was deliberately private—but the package users actually installed could not load it. “Package version is current” and “this session loaded the extension” are different facts.

The repair makes the ordinary `skill-harness` npm package a real Pi package. Its manifest declares the committed extension bundle, and the same package includes the observer sibling and review assets the bundle resolves at runtime. The build copies those files from their canonical sources; a freshness test compares every byte; release packaging inventories them rather than accepting whatever happened to be in `dist`.

A supported local-package Pi launch now shows the extension resource. That is source-package evidence, not installed-release evidence. The released package remains unvalidated until a future reviewed version is packed, installed into a fresh Pi root, loaded, and observed there.

The small operational rule is the useful one: record source, installed, and loaded identities separately. An update proves only the middle one.
