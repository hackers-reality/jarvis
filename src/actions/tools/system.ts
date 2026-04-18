import { Tool } from '../../daemon/tool-registry.ts';
import { runPowerShell } from './sovereign-control.ts';

/**
 * Sovereign System Tools: Hardware Auditing & Workspace Mastery.
 */

export const systemAuditTool: Tool = {
  name: 'system_audit',
  category: 'system',
  description: 'Perform a deep hardware and security audit of the host machine. Returns CPU/GPU info, battery health, and network status.',
  parameters: {
    includeNetwork: { 
      type: 'boolean', 
      description: 'Whether to check open ports and active connections.', 
      required: false 
    }
  },
  execute: async ({ includeNetwork }) => {
    const script = `
      $report = @{
        CPU = (Get-WmiObject Win32_Processor).Name;
        Load = (Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples.CookedValue;
        Memory = (Get-WmiObject Win32_OperatingSystem).FreePhysicalMemory;
        Battery = (Get-WmiObject -Class "Win32_Battery" -ErrorAction SilentlyContinue).EstimatedChargeRemaining;
        Temp = (Get-WmiObject -Namespace root/wmi -Class msacpi_thermalzonetemperature -ErrorAction SilentlyContinue).CurrentTemperature;
      }
      if ("${includeNetwork}" -eq "true") {
        $report.OpenPorts = (Get-NetTCPConnection -State Listen | Select-Object -First 10).LocalPort;
      }
      $report | ConvertTo-Json
    `;
    const result = await runPowerShell(script);
    return JSON.parse(result);
  }
};

export const workspaceSnapshotTool: Tool = {
  name: 'workspace_snapshot',
  category: 'system',
  description: 'Capture a Stark-level snapshot of all active window positions and file paths for later restoration.',
  parameters: {
    snapshotName: { 
      type: 'string', 
      description: 'Name to save this workspace layout as.', 
      required: true 
    }
  },
  execute: async ({ snapshotName }) => {
    const script = `
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        using System.Collections.Generic;
        using System.Text;
        public class WindowManager {
            [DllImport("user32.dll")]
            public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
            public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
            [DllImport("user32.dll")]
            public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
            [DllImport("user32.dll")]
            public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
            [StructLayout(LayoutKind.Sequential)]
            public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        }
"@
      $windows = New-Object System.Collections.Generic.List[PSObject]
      [WindowManager]::EnumWindows({
          param($hWnd, $lParam)
          $sb = New-Object System.Text.StringBuilder(256)
          [WindowManager]::GetWindowText($hWnd, $sb, $sb.Capacity)
          $rect = New-Object WindowManager+RECT
          [WindowManager]::GetWindowRect($hWnd, [ref]$rect)
          if ($sb.ToString()) {
              $windows.Add([PSCustomObject]@{
                  Title = $sb.ToString();
                  Handle = $hWnd;
                  Left = $rect.Left;
                  Top = $rect.Top;
                  Width = $rect.Right - $rect.Left;
                  Height = $rect.Bottom - $rect.Top;
              })
          }
          return $true
      }, [IntPtr]::Zero)
      $windows | Where-Object { $_.Width -gt 0 -and $_.Height -gt 0 } | ConvertTo-Json
    `;
    const windows = await runPowerShell(script);
    // In a real implementation, we would save this to the Vault.
    // For now, we return it to the LLM to provide feedback.
    return { status: 'snapshot_captured', name: snapshotName, layouts: JSON.parse(windows) };
  }
};

export const SOVEREIGN_SYSTEM_TOOLS = [systemAuditTool, workspaceSnapshotTool];
