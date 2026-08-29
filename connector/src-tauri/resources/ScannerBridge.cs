using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;

namespace LogiFlow.ScannerBridge
{
    /// <summary>
    /// WIA 2.0 scanner bridge used by the LogiFlow Connector (Windows).
    ///
    /// Commands (invoked as a child process, one JSON command per line on stdin,
    /// one JSON result per line on stdout):
    ///
    ///   {"cmd":"discover"}
    ///   {"cmd":"capabilities","deviceId":"..."}
    ///   {"cmd":"scan","deviceId":"...","source":"auto|flatbed|adf","duplex":false,
    ///     "dpi":300,"colorMode":"Color|Grayscale|BlackAndWhite","outputDir":"..."}
    ///   {"cmd":"cancel","jobKey":"..."}
    ///
    /// Scan progress events are printed as JSON lines on stdout:
    ///   {"event":"page","page":1,"file":"...","duplex":"front|back"}
    ///   {"event":"progress","message":"..."}
    ///
    /// Errors are printed as JSON lines:
    ///   {"event":"error","message":"..."}
    /// </summary>
    class Program
    {
        static readonly string Version = "1.0.0";

        // Long-running mode if no args are given; otherwise a single command may be
        // passed as a JSON string argument (used for one-shot invocation).
        static IntPtr _cancellationToken = IntPtr.Zero;

        static void Main(string[] args)
        {
            try
            {
                if (args.Length == 0)
                {
                    // Long-running: read commands from stdin.
                    string line;
                    while ((line = Console.In.ReadLine()) != null)
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        HandleCommand(line);
                    }
                }
                else
                {
                    foreach (var arg in args)
                    {
                        if (!string.IsNullOrWhiteSpace(arg)) HandleCommand(arg);
                    }
                }
            }
            catch (Exception ex)
            {
                PrintError("Bridge fatal: " + ex.Message);
            }
        }

        static void HandleCommand(string json)
        {
            try
            {
                var cmd = SimpleJson.Parse(json);
                var name = cmd["cmd"] as string ?? "";
                switch (name.ToLower())
                {
                    case "discover":
                        Discover();
                        break;
                    case "capabilities":
                        Capabilities(cmd.Get("deviceId", ""));
                        break;
                    case "scan":
                        Scan(cmd);
                        break;
                    case "cancel":
                        _cancellationToken = IntPtr.Zero;
                        Print(new { ok = true });
                        break;
                    case "ping":
                        Print(new { ok = true, version = Version });
                        break;
                    default:
                        PrintError("Unknown command: " + name);
                        break;
                }
            }
            catch (Exception ex)
            {
                PrintError(ex.Message);
            }
        }

        // ─── Discover ────────────────────────────────────────────────────────
        static void Discover()
        {
            var list = new List<object>();
            try
            {
                var mgr = CreateManager();
                if (mgr != null)
                {
                    foreach (dynamic info in mgr.DeviceInfos)
                    {
                        if (info.Type == 1) // WIA_DEVICE_TYPE_SCANNER
                        {
                            string id   = info.DeviceID;
                            string name = PropStr(info.Properties, "Name", "Unknown Scanner");

                            dynamic device = null;
                            try { device = info.Connect(); } catch { }
                            bool hasAdf    = false;
                            bool hasDuplex = false;
                            bool hasFlatbed = true;

                            try
                            {
                                if (device != null)
                                {
                                    int docCaps = (int)PropLong(device.Properties, 3086, 0); // WIA_DPS_DOCUMENT_HANDLING_CAPABILITIES
                                    // 0x1 FEED, 0x4 DUPLEX
                                    hasAdf    = (docCaps & 0x1) != 0;
                                    hasDuplex = (docCaps & 0x4) != 0;

                                    foreach (dynamic item in device.Items)
                                    {
                                        int itemFlags = (int)PropLong(item.Properties, 4099, 0); // WIA_IPA_ITEM_FLAGS
                                        string itemName = PropStr(item.Properties, "Item Name", "");

                                        if ((itemFlags & 0x20000) != 0 ||  // WIA_ITEM_TYPE_FEEDER
                                            itemName.IndexOf("Feed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                            itemName.IndexOf("ADF", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                            itemName.IndexOf("Einzug", StringComparison.OrdinalIgnoreCase) >= 0)
                                        {
                                            hasAdf = true;
                                        }
                                        if (itemFlags != 0) hasFlatbed = true;
                                    }
                                }
                            }
                            catch { }

                            list.Add(new
                            {
                                id = id,
                                name = name,
                                hasAdf = hasAdf,
                                hasDuplex = hasDuplex,
                                hasFlatbed = hasFlatbed,
                                backend = "WIA"
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("WIA discover error: " + ex.Message);
            }
            Print(new { devices = list });
        }

        // ─── Capabilities ────────────────────────────────────────────────────
        static void Capabilities(string deviceId)
        {
            var result = new
            {
                hasFlatbed = true,
                hasAdf = false,
                hasDuplex = false,
                resolutions = new[] { 150, 300, 600 },
                colorModes = new[] { "Color", "Grayscale", "BlackAndWhite" },
                documentFormats = new[] { "image/jpeg" }
            };

            try
            {
                var mgr = CreateManager();
                if (mgr == null) { Print(new { capabilities = result }); return; }

                dynamic info = FindInfo(mgr, deviceId);
                if (info == null) { throw new Exception("Device not found: " + deviceId); }

                dynamic device = info.Connect();
                int docCaps = (int)PropLong(device.Properties, 3086, 0);
                bool hasAdf    = (docCaps & 0x1) != 0;
                bool hasDuplex = (docCaps & 0x4) != 0;

                var resList = new List<int>();
                foreach (dynamic item in device.Items)
                {
                    int itemFlags = (int)PropLong(item.Properties, 4099, 0);
                    string itemName = PropStr(item.Properties, "Item Name", "");
                    if ((itemFlags & 0x20000) != 0 || itemName.IndexOf("Feed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        itemName.IndexOf("ADF", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        hasAdf = true;
                    }
                    // Try to read XResolution supported values
                    try
                    {
                        foreach (dynamic p in item.Properties)
                        {
                            if (p.PropertyID == 6147) // WIA_IPS_XRES
                            {
                                // .SubType / list of valid values
                                object subtype;
                                if (TryGetProp(p, out subtype))
                                {
                                    // For lists, values are in p['SubTypeValues'] etc.
                                }
                                break;
                            }
                        }
                    }
                    catch { }
                }

                if (resList.Count == 0) { resList.AddRange(new[] { 150, 300, 600 }); }
                resList.Sort();

                result = new
                {
                    hasFlatbed = true,
                    hasAdf = hasAdf,
                    hasDuplex = hasDuplex,
                    resolutions = resList.ToArray(),
                    colorModes = new[] { "Color", "Grayscale", "BlackAndWhite" },
                    documentFormats = new[] { "image/jpeg" }
                };
            }
            catch (Exception ex)
            {
                PrintError(ex.Message);
                return;
            }
            Print(new { capabilities = result });
        }

        // ─── Scan ────────────────────────────────────────────────────────────
        static void Scan(System.Collections.Generic.Dictionary<string, object> cmd)
        {
            string deviceId = cmd.Get("deviceId", "");
            string source   = cmd.Get("source", "auto").ToLower();
            bool duplex     = cmd.GetBool("duplex", false);
            int dpi         = (int)cmd.GetLong("dpi", 300);
            string colorMode= cmd.Get("colorMode", "Grayscale");
            string outputDir= cmd.Get("outputDir", Path.GetTempPath());
            string jobKey   = cmd.Get("jobKey", Guid.NewGuid().ToString());

            _cancellationToken = jobKey == "__none__" ? IntPtr.Zero : new IntPtr(Guid.NewGuid().ToString().GetHashCode() + 1);

            try
            {
                var mgr = CreateManager();
                if (mgr == null) throw new Exception("WIA ist auf diesem System nicht verfügbar.");

                dynamic info = FindInfo(mgr, deviceId);
                if (info == null) throw new Exception("Scanner nicht gefunden. Bitte Gerät überprüfen und erneut verbinden.");

                dynamic device = info.Connect();

                dynamic feederItem = null;
                dynamic flatbedItem = null;
                foreach (dynamic devItem in device.Items)
                {
                    int itemFlags = (int)PropLong(devItem.Properties, 4099, 0);
                    string itemName = PropStr(devItem.Properties, "Item Name", "");
                    bool isFeeder = (itemFlags & 0x20000) != 0 ||
                        itemName.IndexOf("Feed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        itemName.IndexOf("ADF", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        itemName.IndexOf("Einzug", StringComparison.OrdinalIgnoreCase) >= 0;
                    bool isFlatbed = (itemFlags & 0x10000) != 0 || // WIA_ITEM_TYPE_FLAT
                        itemName.IndexOf("Flat", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        itemName.IndexOf("Platen", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        itemName.IndexOf("Glas", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        (!isFeeder && feederItem == null && flatbedItem == null);

                    if (isFeeder) feederItem = devItem;
                    else if (isFlatbed) flatbedItem = devItem;
                }
                if (feederItem == null && flatbedItem == null && device.Items.Count > 0)
                {
                    flatbedItem = device.Items[0];
                }

                bool useAdf = source == "adf" || (source == "auto" && feederItem != null);
                dynamic item = useAdf ? (feederItem ?? flatbedItem) : (flatbedItem ?? feederItem);
                if (item == null) throw new Exception("Kein Scan-Element (Flatbed/ADF) verfügbar.");

                // Select document handling source on the device root.
                bool feederSelected = false;
                try
                {
                    if (useAdf)
                    {
                        SetProp(device.Properties, 3088, 1); // FEEDER
                        feederSelected = true;
                        if (!duplex) SetProp(device.Properties, 3096, 1); // WIA_DPS_PAGES = 1 (loop ourselves)
                    }
                    else
                    {
                        SetProp(device.Properties, 3088, 2); // FLATBED
                    }
                }
                catch { }

                int colorVal = 2; // Grayscale
                if (string.Equals(colorMode, "Color", StringComparison.OrdinalIgnoreCase)) colorVal = 1;
                else if (string.Equals(colorMode, "BlackAndWhite", StringComparison.OrdinalIgnoreCase)) colorVal = 4;

                SetProp(item.Properties, 6147, dpi); // X Res
                SetProp(item.Properties, 6148, dpi); // Y Res
                SetProp(item.Properties, 6146, colorVal); // Intent / Current Intent

                // Force JPEG output format.
                try { SetProp(item.Properties, 4104, "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"); }
                catch { try { SetProp(item.Properties, 4106, "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"); } catch { } }

                Directory.CreateDirectory(outputDir);
                var scannedFiles = new List<string>();
                int pageIndex = 0;
                bool lastWasFront = true;

                while (true)
                {
                    if (IsCancelled(jobKey)) { break; }
                    pageIndex++;
                    string outFile = Path.Combine(outputDir, string.Format("page_{0:D3}.jpg", pageIndex));

                    try
                    {
                        Print(new { @event = "progress", message = "Scanne Seite " + pageIndex + " ..." });

                        dynamic img = item.Transfer();
                        if (img != null)
                        {
                            img.SaveFile(outFile);
                            if (!File.Exists(outFile)) break;
                            scannedFiles.Add(outFile);
                            Print(new { @event = "page", page = pageIndex, file = outFile });

                            if (!useAdf) break; // Flatbed: single page
                            // Manual duplex: for duplex a second transfer of the back side.
                            if (duplex && feederSelected && lastWasFront)
                            {
                                lastWasFront = false;
                                try
                                {
                                    dynamic back = item.Transfer();
                                    if (back != null)
                                    {
                                        string backFile = Path.Combine(outputDir, string.Format("page_{0:D3}_back.jpg", pageIndex));
                                        back.SaveFile(backFile);
                                        if (File.Exists(backFile))
                                        {
                                            scannedFiles.Add(backFile);
                                            Print(new { @event = "page", page = pageIndex, file = backFile, duplex = "back" });
                                        }
                                    }
                                }
                                catch { }
                                lastWasFront = true;
                            }
                            // If WIA is configured to auto-duplex (one transfer returns front+back combined),
                            // WIA_DPS_PAGES may already be 2; keep the loop but guard with small pause.
                            Thread.Sleep(250);
                        }
                        else break;
                    }
                    catch (COMException ex)
                    {
                        // WIA_ERROR_PAPER_EMPTY (0x80210003) or WIA_ERROR_OFFLINE (0x80210001)
                        if (ex.ErrorCode == unchecked((int)0x80210003) || ex.ErrorCode == unchecked((int)0x80210001))
                        {
                            if (pageIndex == 1 && scannedFiles.Count == 0 && !useAdf && flatbedItem != null)
                            {
                                // Fallback for auto mode when ADF chosen but empty -> don't loop; caller decides.
                            }
                            break; // normal end of ADF feeder
                        }
                        if (scannedFiles.Count > 0) break; // ended after pages
                        throw new Exception("WIA Fehler: " + ex.Message);
                    }
                    catch (Exception)
                    {
                        if (scannedFiles.Count > 0) break;
                        throw;
                    }

                    if (!feederSelected) break;
                }

                if (scannedFiles.Count == 0)
                {
                    throw new Exception(useAdf
                        ? "Keine Seiten erfasst. Bitte Dokumente in den automatischen Einzug (ADF) legen."
                        : "Keine Seite erfasst. Bitte Dokument auf das Flachbettglas legen.");
                }

                Print(new { ok = true, pages = scannedFiles.Count, files = scannedFiles.ToArray() });
            }
            catch (Exception ex)
            {
                PrintError(ex.Message);
            }
        }

        static bool IsCancelled(string jobKey) { return false; /* cancellation handled by process kill in caller */ }

        static dynamic CreateManager()
        {
            try
            {
                Type t = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (t == null) return null;
                return Activator.CreateInstance(t);
            }
            catch { return null; }
        }

        static dynamic FindInfo(dynamic mgr, string searchKey)
        {
            if (string.IsNullOrEmpty(searchKey) || searchKey == "auto") return null;
            foreach (dynamic info in mgr.DeviceInfos)
            {
                if (info.Type != 1) continue;
                string name = PropStr(info.Properties, "Name", "");
                string id = info.DeviceID;
                if (id.Contains(searchKey) || name.Contains(searchKey)) return info;
            }
            return null;
        }

        static string PropStr(dynamic props, object idOrName, string def)
        {
            try
            {
                foreach (dynamic p in props)
                {
                    if (p.PropertyID.Equals(idOrName) || p.Name.Equals(idOrName)) return (p.Value ?? "").ToString();
                }
            }
            catch { }
            return def;
        }

        static long PropLong(dynamic props, object idOrName, long def)
        {
            try
            {
                foreach (dynamic p in props)
                {
                    if (p.PropertyID.Equals(idOrName) || p.Name.Equals(idOrName))
                    {
                        if (p.Value == null) return def;
                        return Convert.ToInt64(p.Value);
                    }
                }
            }
            catch { }
            return def;
        }

        static void SetProp(dynamic props, object idOrName, object val)
        {
            try
            {
                foreach (dynamic p in props)
                {
                    if (p.PropertyID.Equals(idOrName) || p.Name.Equals(idOrName))
                    {
                        p.Value = val;
                        return;
                    }
                }
            }
            catch { }
        }

        static bool TryGetProp(dynamic p, out object val)
        {
            val = null;
            try { val = p.Value; return true; } catch { return false; }
        }

        static void Print(object obj)
        {
            Console.WriteLine(SimpleJson.Stringify(obj));
        }

        static void PrintError(string msg)
        {
            Console.WriteLine(SimpleJson.Stringify(new { @event = "error", message = msg }));
        }
    }

    /// <summary>
    /// Minimal JSON serializer/parser tuned for this bridge's simple payloads.
    /// </summary>
    public static class SimpleJson
    {
        public static Dictionary<string, object> Parse(string json)
        {
            var d = new Dictionary<string, object>();
            int i = 0;
            SkipWs(json, ref i);
            ParseObject(json, ref i, d);
            return d;
        }

        static void ParseObject(string s, ref int i, Dictionary<string, object> d)
        {
            if (s[i] == '{') i++;
            SkipWs(s, ref i);
            while (i < s.Length && s[i] != '}')
            {
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                if (s[i] == ':') i++;
                SkipWs(s, ref i);
                object val = ParseValue(s, ref i);
                d[key] = val;
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') i++;
                SkipWs(s, ref i);
            }
            if (i < s.Length && s[i] == '}') i++;
        }

        static List<object> ParseArray(string s, ref int i)
        {
            var l = new List<object>();
            if (s[i] == '[') i++;
            SkipWs(s, ref i);
            while (i < s.Length && s[i] != ']')
            {
                l.Add(ParseValue(s, ref i));
                SkipWs(s, ref i);
                if (i < s.Length && s[i] == ',') i++;
                SkipWs(s, ref i);
            }
            if (i < s.Length && s[i] == ']') i++;
            return l;
        }

        static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            char c = s[i];
            if (c == '"') return ParseString(s, ref i);
            if (c == '{') { var d = new Dictionary<string, object>(); ParseObject(s, ref i, d); return d; }
            if (c == '[') return ParseArray(s, ref i);
            if (c == 't' || c == 'f') { string lit = s.Substring(i, c == 't' ? 4 : 5); i += lit.Length; return lit == "true"; }
            if (c == 'n') { i += 4; return null; }
            int start = i;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '-' || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+')) i++;
            string num = s.Substring(start, i - start);
            if (num.Contains(".") || num.Contains("e") || num.Contains("E")) return double.Parse(num, System.Globalization.CultureInfo.InvariantCulture);
            return long.Parse(num);
        }

        static string ParseString(string s, ref int i)
        {
            if (s[i] == '"') i++;
            var sb = new System.Text.StringBuilder();
            while (i < s.Length)
            {
                char c = s[i];
                if (c == '\\')
                {
                    i++;
                    char e = s[i];
                    switch (e)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'u':
                            string hex = s.Substring(i + 1, 4);
                            sb.Append((char)Convert.ToInt32(hex, 16));
                            i += 4;
                            break;
                        default: sb.Append('\\').Append(e); break;
                    }
                    i++;
                }
                else if (c == '"') { i++; break; }
                else { sb.Append(c); i++; }
            }
            return sb.ToString();
        }

        static void SkipWs(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        public static string Stringify(object obj)
        {
            var sb = new System.Text.StringBuilder();
            WriteValue(sb, obj);
            return sb.ToString();
        }

        static void WriteValue(System.Text.StringBuilder sb, object v)
        {
            if (v == null) { sb.Append("null"); return; }
            if (v is string s) { WriteString(sb, s); return; }
            if (v is bool b) { sb.Append(b ? "true" : "false"); return; }
            if (v is long || v is int || v is double || v is float || v is decimal) { sb.Append(Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)); return; }
            if (v is IEnumerable<object> arr) { sb.Append('['); bool first = true; foreach (var x in arr) { if (!first) sb.Append(','); first = false; WriteValue(sb, x); } sb.Append(']'); return; }
            if (v is string[] sa) { sb.Append('['); for (int n = 0; n < sa.Length; n++) { if (n > 0) sb.Append(','); WriteString(sb, sa[n]); } sb.Append(']'); return; }
            if (v is int[] ia) { sb.Append('['); for (int n = 0; n < ia.Length; n++) { if (n > 0) sb.Append(','); sb.Append(ia[n].ToString()); } sb.Append(']'); return; }
            // fallback: use reflection to stringify an anonymous object
            var props = v.GetType().GetProperties();
            sb.Append('{');
            bool f2 = true;
            foreach (var p in props)
            {
                if (!f2) sb.Append(',');
                f2 = false;
                WriteString(sb, p.Name);
                sb.Append(':');
                WriteValue(sb, p.GetValue(v, null));
            }
            sb.Append('}');
        }

        static void WriteString(System.Text.StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 32) sb.Append("\\u" + ((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }
    }

    public static class CmdExt
    {
        public static string Get(this Dictionary<string, object> d, string key, string def)
        {
            if (d != null && d.TryGetValue(key, out var v) && v != null) return v.ToString();
            return def;
        }
        public static long GetLong(this Dictionary<string, object> d, string key, long def)
        {
            if (d != null && d.TryGetValue(key, out var v) && v != null)
            {
                if (v is long l) return l;
                if (v is int i) return i;
                if (v is double dd) return (long)dd;
                if (long.TryParse(v.ToString(), out l)) return l;
            }
            return def;
        }
        public static bool GetBool(this Dictionary<string, object> d, string key, bool def)
        {
            if (d != null && d.TryGetValue(key, out var v) && v != null)
            {
                if (v is bool b) return b;
                if (bool.TryParse(v.ToString(), out b)) return b;
            }
            return def;
        }
    }
}
