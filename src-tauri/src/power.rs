#[cfg(windows)]
mod platform {
    use std::{ffi::c_void, mem::size_of};
    use windows::Win32::System::Threading::{
        GetCurrentProcess, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        PROCESS_POWER_THROTTLING_EXECUTION_SPEED, PROCESS_POWER_THROTTLING_STATE, ProcessPowerThrottling,
        SetPriorityClass, SetProcessInformation, SetProcessWorkingSetSize,
    };

    fn set_efficiency_mode(enabled: bool) {
        let state = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: if enabled { PROCESS_POWER_THROTTLING_EXECUTION_SPEED } else { 0 },
        };

        // SAFETY: the pseudo handle is always valid, and the pointer and size describe `state`.
        let result = unsafe {
            SetProcessInformation(
                GetCurrentProcess(),
                ProcessPowerThrottling,
                (&raw const state).cast::<c_void>(),
                size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
            )
        };
        if result.is_err() {
            eprintln!("Could not change Efficiency mode");
        }
    }

    pub fn background() {
        // SAFETY: the pseudo handle is always valid for the current process.
        unsafe {
            let process = GetCurrentProcess();
            // Task Manager only shows the Efficiency mode leaf for idle priority plus EcoQoS.
            if SetPriorityClass(process, IDLE_PRIORITY_CLASS).is_err() {
                eprintln!("Could not lower the process priority");
            }
            set_efficiency_mode(true);
            // usize::MAX twice is the documented way to trim the working set.
            if SetProcessWorkingSetSize(process, usize::MAX, usize::MAX).is_err() {
                eprintln!("Could not trim the working set");
            }
        }
    }

    pub fn foreground() {
        // SAFETY: the pseudo handle is always valid for the current process.
        unsafe {
            if SetPriorityClass(GetCurrentProcess(), NORMAL_PRIORITY_CLASS).is_err() {
                eprintln!("Could not restore the process priority");
            }
        }
        set_efficiency_mode(false);
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn background() {}
    pub fn foreground() {}
}

pub use platform::{background, foreground};

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetPriorityClass, IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS,
    };

    fn priority() -> u32 {
        // SAFETY: the pseudo handle is always valid for the current process.
        unsafe { GetPriorityClass(GetCurrentProcess()) }
    }

    #[test]
    fn background_lowers_priority_and_foreground_never_goes_above_normal() {
        background();
        assert_eq!(priority(), IDLE_PRIORITY_CLASS.0);

        foreground();
        assert_eq!(priority(), NORMAL_PRIORITY_CLASS.0);
    }
}
