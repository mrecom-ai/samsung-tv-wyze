# Security and data flow

## Public source vs local setup

This repository is a source-only export. It contains no personal certificate,
Wyze account/API credentials, TV identity, LAN address, private Git history,
camera media or generated provisioning key. `dist/` and `.local/` are ignored.
The default runtime configuration disables provisioning until the user creates
a local session and explicitly includes it when building.

The public app has no telemetry endpoint. Protocol constants needed to sign
requests are public client constants, not user credentials. The code uses an
undocumented Wyze video endpoint and may need changes if Wyze changes it.

## Account and video

1. The TV sends its account/API sign-in request over HTTPS to Wyze.
2. It receives session tokens, discovers camera capabilities, and requests the appropriate
   classic WebRTC or Agora/lake signaling parameters through Wyze. Authentication is not bypassed.
3. Video uses WebRTC/DTLS-SRTP with Wyze/AWS or Agora signaling and ICE/TURN as provided
   by Wyze. Media may be relayed; do not describe it as LAN-only or offline.
   Lake media keys are unwrapped in memory; Agora log uploads are disabled.
4. The app never asks for microphone/camera capture and adds no outgoing media
   tracks. Only the selected video element has unmuted sound.

API credentials/password/MFA details are transient. Optional saved access and
refresh tokens plus the required login account ID are stored in TV localStorage without app-level encryption.
Sign out clears saved tokens; possession of a TV/root-level device access can
expose local app storage. Treat a personalized signed widget as private too.

## One-time setup service

The loopback-only form accepts a POST only with matching Host, Origin and a
random anti-CSRF value. Only the configured TV address can fetch the random
handoff endpoint. That endpoint contains a NaCl authenticated encrypted box,
not plaintext credentials. TV receiver and computer sender keys are generated
per session and pinned into the local build overlay. This does not replace
network isolation or secure the initial Samsung developer-install transport.

The server has no request/body logging. Submitted fields are cleared in the
browser; credentials are not deliberately written to disk. JavaScript garbage
collection and OS/browser memory/swap mean secure memory erasure is not claimed.
The ciphertext is removed after acknowledgement. The service stops after
receipt/timeout; it is not a runtime dependency of the viewer.

Use only on your trusted LAN. Do not port-forward SDB or the setup service.
Revoke an exposed Wyze API key through Wyze's developer portal and sign out.
Never put secrets into issue reports, debug logs or public screenshots.

## Reporting a problem

Provide TV model/Tizen version, camera model, viewer version and the short
on-screen error. Remove names, addresses, serials/DUIDs and account details.
For security-sensitive reports, use GitHub's private vulnerability reporting
if enabled; do not open an issue containing credentials or an exploit against
someone else's account/device.
