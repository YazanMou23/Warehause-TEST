using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices;
using System.Threading;

namespace LogiFlow.ScannerBridge
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.WriteLine("Usage: ScannerBridge.exe <command> [options]");
                return;
            }

            string command = args[0].ToLower();

            try
            {
                if (command == "discover")
                {
                    DiscoverDevices();
                }
                else if (command == "scan")
                {
                    string deviceId = args.Length > 1 ? args[1] : "";
                    string source = args.Length > 2 ? args[2] : "auto";
                    int dpi = args.Length > 3 ? int.Parse(args[3]) : 300;
                    string colorMode = args.Length > 4 ? args[4] : "Grayscale";
                    string outputDir = args.Length > 5 ? args[5] : Path.GetTempPath();
                    
                    ScanDevice(deviceId, source, dpi, colorMode, outputDir);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"error\": \"" + EscapeJson(ex.Message) + "\"}");
            }
        }

        static void DiscoverDevices()
        {
            var devices = new List<object>();
            try
            {
                Type wiaManagerType = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (wiaManagerType != null)
                {
                    dynamic deviceManager = Activator.CreateInstance(wiaManagerType);
                    foreach (dynamic deviceInfo in deviceManager.DeviceInfos)
                    {
                        if (deviceInfo.Type == 1) // 1 = Scanner
                        {
                            string deviceId = deviceInfo.DeviceID;
                            string name = GetPropertyValue(deviceInfo.Properties, "Name", "Unknown Scanner");
                            
                            dynamic device = deviceInfo.Connect();
                            
                            int docCaps = (int)GetPropertyValue(device.Properties, 3086, 0); // WIA_DPS_DOCUMENT_HANDLING_CAPABILITIES
                            bool hasAdf = (docCaps & 1) != 0;
                            bool hasDuplex = (docCaps & 4) != 0;

                            // Walk item tree to ensure we catch WIA 2.0 Feeder vs Flatbed explicitly
                            foreach (dynamic item in device.Items)
                            {
                                int itemFlags = (int)GetPropertyValue(item.Properties, 4099, 0);
                                string itemName = GetPropertyValue(item.Properties, "Item Name", "");
                                
                                if ((itemFlags & 0x20000) != 0 || itemName.IndexOf("Feed", StringComparison.OrdinalIgnoreCase) >= 0 || itemName.IndexOf("ADF", StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    hasAdf = true;
                                }
                            }

                            devices.Add(new
                            {
                                id = deviceId,
                                name = name,
                                hasAdf = hasAdf,
                                hasDuplex = hasDuplex,
                                hasFlatbed = true,
                                backend = "WIA"
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // Just swallow COM errors during discovery to not crash
                Console.Error.WriteLine("Discovery error: " + ex.Message);
            }

            Console.WriteLine("[");
            for (int i = 0; i < devices.Count; i++)
            {
                dynamic d = devices[i];
                Console.Write("{\"id\":\"" + EscapeJson(d.id) + "\",\"name\":\"" + EscapeJson(d.name) + "\",\"hasAdf\":" + d.hasAdf.ToString().ToLower() + ",\"hasDuplex\":" + d.hasDuplex.ToString().ToLower() + ",\"hasFlatbed\":true,\"backend\":\"WIA\"}");
                if (i < devices.Count - 1) Console.Write(",");
            }
            Console.WriteLine("]");
        }

        static void ScanDevice(string searchKey, string source, int dpi, string colorMode, string outputDir)
        {
            Type wiaManagerType = Type.GetTypeFromProgID("WIA.DeviceManager");
            dynamic deviceManager = Activator.CreateInstance(wiaManagerType);
            dynamic targetInfo = null;

            foreach (dynamic info in deviceManager.DeviceInfos)
            {
                if (info.Type == 1)
                {
                    string name = GetPropertyValue(info.Properties, "Name", "");
                    string id = info.DeviceID;
                    if (string.IsNullOrEmpty(searchKey) || searchKey == "auto" || name.Contains(searchKey) || id.Contains(searchKey))
                    {
                        targetInfo = info;
                        break;
                    }
                }
            }

            if (targetInfo == null)
            {
                throw new Exception("Device not found.");
            }

            dynamic device = targetInfo.Connect();
            int docCaps = (int)GetPropertyValue(device.Properties, 3086, 0);
            bool hasAdfHardware = (docCaps & 1) != 0;
            
            dynamic feederItem = null;
            dynamic flatbedItem = null;

            foreach (dynamic item in device.Items)
            {
                int itemFlags = (int)GetPropertyValue(item.Properties, 4099, 0);
                string itemName = GetPropertyValue(item.Properties, "Item Name", "");
                if ((itemFlags & 0x20000) != 0 || itemName.IndexOf("Feed", StringComparison.OrdinalIgnoreCase) >= 0 || itemName.IndexOf("ADF", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    feederItem = item;
                    hasAdfHardware = true;
                }
                if ((itemFlags & 0x10000) != 0 || itemName.IndexOf("Flat", StringComparison.OrdinalIgnoreCase) >= 0 || itemName.IndexOf("Platen", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    flatbedItem = item;
                }
            }

            bool useFeeder = false;
            if (source.ToLower() == "flatbed") useFeeder = false;
            else if (source.ToLower() == "adf") useFeeder = true;
            else useFeeder = hasAdfHardware; // auto

            // Select Document Handling
            if (useFeeder)
            {
                SetPropertyValue(device.Properties, 3088, 1); // WIA_DPS_DOCUMENT_HANDLING_SELECT = FEEDER
                SetPropertyValue(device.Properties, 3096, 1); // WIA_DPS_PAGES = 1 (1 page at a time for loop)
            }
            else
            {
                SetPropertyValue(device.Properties, 3088, 2); // FLATBED
            }

            dynamic scanItem = useFeeder ? (feederItem ?? device.Items[1]) : (flatbedItem ?? device.Items[1]);

            // Setup DPI & Color
            SetPropertyValue(scanItem.Properties, 6147, dpi); // X Res
            SetPropertyValue(scanItem.Properties, 6148, dpi); // Y Res
            int colorVal = 2; // Grayscale
            if (colorMode.ToLower() == "color") colorVal = 1;
            else if (colorMode.ToLower() == "blackandwhite") colorVal = 4;
            SetPropertyValue(scanItem.Properties, 6146, colorVal); // Intent/Color
            
            // Force Format to JPEG
            SetPropertyValue(scanItem.Properties, 4106, "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"); // WIA_IPA_FORMAT

            int pageIndex = 0;
            var scannedFiles = new List<string>();

            while (true)
            {
                pageIndex++;
                string outputFile = Path.Combine(outputDir, string.Format("page_{0}.jpg", pageIndex));
                try
                {
                    dynamic img = scanItem.Transfer();
                    if (img != null)
                    {
                        img.SaveFile(outputFile);
                        if (File.Exists(outputFile))
                        {
                            scannedFiles.Add(outputFile);
                            Console.WriteLine("{\"progress\":\"PAGE_SCANNED\",\"page\":" + pageIndex + ",\"file\":\"" + EscapeJson(outputFile) + "\"}");
                        }
                        else break;
                    }
                    else break;
                }
                catch (COMException ex)
                {
                    // WIA_ERROR_PAPER_EMPTY
                    if (ex.ErrorCode == unchecked((int)0x80210003) || ex.ErrorCode == unchecked((int)0x80210001)) 
                    {
                        if (pageIndex == 1 && scannedFiles.Count == 0 && source.ToLower() == "auto" && flatbedItem != null)
                        {
                            // Fallback to flatbed if ADF is empty on first page in auto mode
                            Console.WriteLine("{\"progress\":\"FALLBACK_FLATBED\"}");
                            SetPropertyValue(device.Properties, 3088, 2);
                            SetPropertyValue(flatbedItem.Properties, 6147, dpi);
                            SetPropertyValue(flatbedItem.Properties, 6148, dpi);
                            SetPropertyValue(flatbedItem.Properties, 6146, colorVal);
                            
                            string flatFile = Path.Combine(outputDir, "page_1.jpg");
                            try
                            {
                                dynamic imgFlat = flatbedItem.Transfer();
                                imgFlat.SaveFile(flatFile);
                                scannedFiles.Add(flatFile);
                                Console.WriteLine("{\"progress\":\"PAGE_SCANNED\",\"page\":1,\"file\":\"" + EscapeJson(flatFile) + "\"}");
                            }
                            catch { }
                            break;
                        }
                        break; // Normal finish
                    }
                    
                    if (scannedFiles.Count > 0) break; // Finished but threw generic error
                    throw new Exception("WIA Error: " + ex.Message);
                }
                catch (Exception)
                {
                    if (scannedFiles.Count > 0) break;
                    throw;
                }

                if (!useFeeder) break; // Flatbed only has one page
            }

            Console.WriteLine("{\"success\":true,\"pages\":" + scannedFiles.Count + ",\"files\":[" + string.Join(",", scannedFiles.Select(f => "\"" + EscapeJson(f) + "\"")) + "]}");
        }

        static object GetPropertyValue(dynamic properties, object propNameOrId, object defaultValue)
        {
            try
            {
                foreach (dynamic p in properties)
                {
                    if (p.PropertyID.Equals(propNameOrId) || p.Name.Equals(propNameOrId))
                    {
                        return p.Value;
                    }
                }
            }
            catch { }
            return defaultValue;
        }

        static void SetPropertyValue(dynamic properties, object propNameOrId, object val)
        {
            try
            {
                foreach (dynamic p in properties)
                {
                    if (p.PropertyID.Equals(propNameOrId) || p.Name.Equals(propNameOrId))
                    {
                        p.Value = val;
                        return;
                    }
                }
            }
            catch { }
        }

        static string EscapeJson(string str)
        {
            if (string.IsNullOrEmpty(str)) return "";
            return str.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }
    }
}
