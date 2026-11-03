/**
 * Config plugin do JARVIS AI (Fase 3):
 *  - copia native/ios/JarvisAppIntents.swift para o ALVO PRINCIPAL do app (App Intents
 *    precisam estar no alvo do app para a Siri/Atalhos os descobrirem);
 *  - registra "Jarvis" como nome alternativo do app para a Siri;
 *  - define português (Brasil) como idioma de desenvolvimento (frases da Siri em pt-BR).
 */
const fs = require("fs");
const path = require("path");
const { withInfoPlist, withXcodeProject, IOSConfig } = require("expo/config-plugins");

const FILE = "JarvisAppIntents.swift";

function withJarvisAppIntents(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.INAlternativeAppNames = [{ INAlternativeAppName: "Jarvis" }];
    c.modResults.CFBundleDevelopmentRegion = "pt-BR";
    return c;
  });

  config = withXcodeProject(config, (c) => {
    const contents = fs.readFileSync(path.join(c.modRequest.projectRoot, "native", "ios", FILE), "utf8");
    const projectName = IOSConfig.XcodeUtils.getProjectName(c.modRequest.projectRoot);
    c.modResults = IOSConfig.XcodeProjectFile.createBuildSourceFile({
      project: c.modResults,
      nativeProjectRoot: c.modRequest.platformProjectRoot,
      filePath: path.join(projectName, FILE),
      fileContents: contents,
      overwrite: true,
    });

    // Região de desenvolvimento pt-BR no projeto (as frases das App Shortcuts são escritas em português).
    const projects = c.modResults.pbxProjectSection();
    for (const key of Object.keys(projects)) {
      const p = projects[key];
      if (!p || typeof p !== "object" || p.isa !== "PBXProject") continue;
      p.developmentRegion = '"pt-BR"';
      const regions = (p.knownRegions || []).map((r) => String(r).replace(/"/g, ""));
      if (!regions.includes("pt-BR")) p.knownRegions = [...(p.knownRegions || []), '"pt-BR"'];
    }
    return c;
  });

  return config;
}

module.exports = withJarvisAppIntents;
