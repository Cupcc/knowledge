import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const docsDir = path.join(rootDir, 'docs')
const configPath = path.join(docsDir, '.vitepress', 'config.mts')

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return walk(fullPath)
      }
      return [fullPath]
    })
  )

  return files.flat()
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/')
}

function normalizeRoute(route) {
  if (!route) return null
  if (!route.startsWith('/')) return null

  const cleanRoute = route.split('#')[0].split('?')[0]
  if (cleanRoute === '/') return '/'

  const noExtension = cleanRoute.replace(/\.html$/, '').replace(/\.md$/, '')
  const noIndex = noExtension.replace(/\/index$/, '')
  const normalized = noIndex.endsWith('/') ? noIndex.slice(0, -1) : noIndex

  return normalized || '/'
}

function routeVariantsFromMarkdown(relativePath) {
  const normalizedPath = toPosix(relativePath)

  if (normalizedPath === 'index.md') {
    return ['/']
  }

  if (normalizedPath.endsWith('/index.md')) {
    const route = `/${normalizedPath.slice(0, -'/index.md'.length)}`
    return [route]
  }

  return [`/${normalizedPath.slice(0, -'.md'.length)}`]
}

function collectLocalLinks(content, filePath) {
  const results = []
  const lines = content.split(/\r?\n/)

  const markdownLinkPattern = /\[[^\]]+\]\((\/[^)\s]+(?:#[^)]+)?)\)/g
  const yamlOrConfigLinkPattern =
    /\blink:\s*['"]?(\/[^'"\s]+(?:#[^'"\s]+)?)['"]?/g

  for (const [index, line] of lines.entries()) {
    for (const pattern of [markdownLinkPattern, yamlOrConfigLinkPattern]) {
      pattern.lastIndex = 0
      let match = pattern.exec(line)
      while (match) {
        results.push({
          filePath,
          lineNumber: index + 1,
          rawLink: match[1]
        })
        match = pattern.exec(line)
      }
    }
  }

  return results
}

async function main() {
  const allFiles = await walk(docsDir)
  const markdownFiles = allFiles.filter((filePath) => {
    const relative = path.relative(docsDir, filePath)
    return filePath.endsWith('.md') && !relative.startsWith('.vitepress')
  })

  const validRoutes = new Set()

  for (const filePath of markdownFiles) {
    const relativePath = path.relative(docsDir, filePath)
    for (const route of routeVariantsFromMarkdown(relativePath)) {
      validRoutes.add(normalizeRoute(route))
    }
  }

  const references = []
  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, 'utf8')
    references.push(
      ...collectLocalLinks(content, path.relative(rootDir, filePath))
    )
  }

  const configContent = await fs.readFile(configPath, 'utf8')
  references.push(
    ...collectLocalLinks(configContent, path.relative(rootDir, configPath))
  )

  const brokenReferences = references.filter(({ rawLink }) => {
    const normalized = normalizeRoute(rawLink)
    return normalized && !validRoutes.has(normalized)
  })

  if (brokenReferences.length > 0) {
    console.error('Found broken internal links:\n')
    for (const reference of brokenReferences) {
      console.error(
        `- ${reference.filePath}:${reference.lineNumber} -> ${reference.rawLink}`
      )
    }
    process.exit(1)
  }

  console.log(`Checked ${references.length} internal links, all passed.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
