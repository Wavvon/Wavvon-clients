# Glossary

One concept, one name, in every catalog. A literal translation of a word the
audience already says in English reads as a machine's ("Tavola sonora" for
Soundboard), and two names for one thing ("Blocchi" for bans, next to the
personal blocks) make people think they are two things.

## Kept in English in every locale

| Term | Notes |
|---|---|
| Wavvon | Product name. |
| Hub, hubs | |
| Soundboard | |
| Webhook | |
| Ban, unban | Verbs follow the language: it *bannare*, es *banear*, de *bannen*. Never the word for a personal block. |
| Push-to-talk | de writes *Push-to-Talk*. |
| Emoji | |
| Passkey | |
| App, Bio, Chat | |

## One rendering per locale

| en | it | es | de |
|---|---|---|---|
| recovery phrase | frase di recupero | frase de recuperación | Wiederherstellungsphrase |
| screen share | condivisione schermo | compartir pantalla | Bildschirmfreigabe |
| block (personal) | blocca | bloquear | blockieren |
| mute | silenzia | silenciar | stummschalten |
| timeout | sospensione | suspensión | Auszeit |
| display name | nome visualizzato | nombre visible | Anzeigename |

A string left in English in it/es/de is a bug unless its every word is in the
first table: `check-i18n` reports a missing key, not an untranslated one.
