var builder = WebApplication.CreateBuilder(args);

// Ensure the application reads environment variables (default, but explicitly configured for Infisical)
builder.Configuration.AddEnvironmentVariables();

var app = builder.Build();

var postgresUrl = app.Configuration["POSTGRES_URL"];

app.MapGet("/", () => $"C# Backend running! Postgres Configured: {!string.IsNullOrEmpty(postgresUrl)}");

app.Run();
