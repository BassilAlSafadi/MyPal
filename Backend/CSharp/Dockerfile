# Dockerfile for csharp-backend
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet build "MyPal.API/MyPal.API.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "MyPal.API/MyPal.API.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "MyPal.API.dll"]