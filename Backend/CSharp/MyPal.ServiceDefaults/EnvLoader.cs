namespace MyPal.ServiceDefaults;

/// <summary>
/// Loads the repository-root .env into the process environment.
/// Lifted verbatim from the pre-split MyPal.API Program.cs so every service
/// keeps resolving configuration exactly the way the monolith did.
/// </summary>
public static class EnvLoader
{
    public static void LoadDotEnv(string contentRootPath)
    {
        var possiblePaths = new[]
        {
            Path.Combine(contentRootPath, ".env"),
            Path.GetFullPath(Path.Combine(contentRootPath, "..", "..", "..", ".env"))
        };

        foreach (var path in possiblePaths)
        {
            if (!File.Exists(path)) continue;

            foreach (var rawLine in File.ReadLines(path))
            {
                var line = rawLine.Trim();
                if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;
                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0) continue;

                var key = line[..separatorIndex].Trim();
                var value = line[(separatorIndex + 1)..].Trim().Trim('"');
                if (string.IsNullOrEmpty(key)) continue;
                if (Environment.GetEnvironmentVariable(key) is null)
                {
                    Environment.SetEnvironmentVariable(key, value);
                }
            }

            break;
        }
    }
}
