# K15 eGPU Baseline (Known-Good)

## Symptom
- GPU tearing/stuttering at/after boot/login
- Session drops back to login
- Event Viewer: `nvlddmkm` Event ID 153 repeating (TDR resets)

## Fix that worked
- **Safe Mode**
- Uninstall NVIDIA drivers
- Reinstall NVIDIA **Game Ready** driver (clean reinstall)

## Notes
- No other toggles were required (Fast Startup / HAGS / VRR/G-Sync left unchanged).

## If it regresses
1) Confirm `nvlddmkm` Event 153 bursts.
2) Repeat safe reinstall.
3) Only if still unstable: then consider disabling HAGS/VRR/Fast Startup as secondary mitigations.
