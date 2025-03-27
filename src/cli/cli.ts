import { cac } from 'cac'
import { consola } from 'consola'
import { version } from '../../package.json'
import { loadConfig } from '../config/config'
import { CodeReviewer } from '../core/reviewer'

const cli = cac('ai-review')

/**
 * 设置CLI版本和帮助信息
 */
cli
  .version(version)
  .help()
  .option('-c, --config <path>', '配置文件路径')
  .option('--debug', '启用调试模式')

/**
 * 审查GitLab合并请求
 */
cli
  .command('gitlab-mr', '审查GitLab合并请求')
  .option('--project-id <id>', 'GitLab项目ID')
  .option('--mr-id <id>', '合并请求ID')
  .action(async (options) => {
    try {
      if (!options.projectId || !options.mrId) {
        consola.error('缺少必要参数: --project-id 和 --mr-id 是必需的')
        process.exit(1)
      }

      const config = await loadConfig(options.config, {
        platform: {
          type: 'gitlab',
        },
      })

      const reviewer = new CodeReviewer({
        config,
        projectId: options.projectId,
        mergeRequestId: options.mrId,
      })

      await reviewer.review()
    }
    catch (error) {
      consola.error('GitLab合并请求审查失败:', error)
      process.exit(1)
    }
  })

/**
 * 审查GitHub拉取请求
 */
cli
  .command('github-pr', '审查GitHub拉取请求')
  .option('--owner <owner>', '仓库所有者')
  .option('--repo <repo>', '仓库名称')
  .option('--pr-id <id>', '拉取请求ID')
  .action(async (options) => {
    try {
      if (!options.owner || !options.repo || !options.prId) {
        consola.error('缺少必要参数: --owner, --repo 和 --pr-id 是必需的')
        process.exit(1)
      }

      const config = await loadConfig(options.config, {
        platform: {
          type: 'github',
        },
      })

      const reviewer = new CodeReviewer({
        config,
        owner: options.owner,
        repo: options.repo,
        prId: options.prId,
      })

      await reviewer.review()
    }
    catch (error) {
      consola.error('GitHub拉取请求审查失败:', error)
      process.exit(1)
    }
  })

/**
 * 审查本地代码
 */
cli
  .command('local', '审查本地代码')
  .option('--path <path>', '代码路径')
  .option('--commit <sha>', '特定提交的SHA')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config, {
        platform: {
          type: 'local',
        },
      })

      const reviewer = new CodeReviewer({
        config,
        path: options.path,
        commitSha: options.commit,
      })

      await reviewer.review()
    }
    catch (error) {
      consola.error('本地代码审查失败:', error)
      process.exit(1)
    }
  })

/**
 * 解析命令行参数
 */
function run(): void {
  try {
    cli.parse(process.argv, { run: false })

    if (!process.argv.slice(2).length) {
      cli.outputHelp()
      return
    }

    cli.runMatchedCommand()
  }
  catch (error) {
    consola.error('命令执行出错:', error)
    process.exit(1)
  }
}

export default { run }
