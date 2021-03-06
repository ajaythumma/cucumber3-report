const fs = require('fs-extra')
const moment = require('moment')
const Mustache = require('mustache')
const path = require('path')
require('moment-duration-format')
const template = require('./template.js')
const calculateResult = function (result) {
  const features = result.features
  return features
    .filter(feature => feature.elements)
    .map(feature => {
      feature.duration = 0
      feature.status = 'passed'
      feature.tagStr = feature.tags.reduce((pre, cur) => {
        return pre + ' ' + cur.name
      }, '') || ''
      feature.elements.map(scenario => {
        scenario.duration = 0
        scenario.status = 'passed'
        scenario.featureTagStr = feature.tagStr
        scenario.tagStr = scenario.tags
          .reduce((pre, cur) => {
            return cur.line > 1 ? pre + ' ' + cur.name : pre
          }, '')
        scenario.steps = scenario.steps
          .map(step => {
            if (step.embeddings) {
              handleEmbeddings(step, scenario)
            }
            if (step.hidden) {
              return
            }
            const duration = step.result.duration
            if (duration) {
              step.time = formatDuration(duration)
              scenario.duration += step.result.duration
            } else {
              step.time = '0s'
            }
            step.status = step.result.status
            result.summary.step[step.status] += 1
            if (step.status === 'failed') {
              scenario.status = 'failed'
            }
            return step
          })
        .filter(step => step)
        scenario.time = formatDuration(scenario.duration)
        result.summary.scenario[scenario.status] += 1
        if (scenario.status === 'failed') {
          feature.status = 'failed'
        }
        feature.duration += scenario.duration
        return scenario
      })
      feature.time = formatDuration(feature.duration)
      result.summary.feature[feature.status] += 1
      return feature
    })
}
const handleEmbeddings = function (step, scenario) {
  step.embeddings.map(embedding => {
    if (embedding.mime_type === 'application/json') {
      step.json = JSON.parse(embedding.data)
    } else if (embedding.mime_type === 'text/imagename') {
      if (step.hidden) {
        scenario.image = embedding.data
      } else {
        if (!Array.isArray(step.image)) {
          step.image = []
        }
        step.image.push(embedding.data)
      }
    } else if (embedding.mime_type === 'text/plain') {
      step.text = embedding.data
    }
  })
}
const validateOption = async function (options) {
  if (!await fs.exists(options.source)) {
    return Promise.reject('Input file ' + options.source + ' does not exist! Aborting')
  }

  if (options.template && !await fs.exists(options.template)) {
    return Promise.reject('Template file ' + options.template + ' does not exist! Aborting')
  }

  if (options.partials && !await fs.existsSync(options.partials)) {
    return Promise.reject('Template partials folder ' + options.template + ' does not exist! Aborting')
  }

  options.dest = options.dest || './reports'
  options.config = options.config || {}
  return Promise.resolve(options)
}
const generateReport = async function (options) {
  const resultOutput = await fs.readJson(options.source || './test/result.json')
  options.config.time = moment().format('MM/DD/YYYY HH:mm:ss')
  const result = {
    features: resultOutput,
    summary: {
      feature: {passed: 0, failed: 0},
      scenario: {passed: 0, failed: 0},
      step: {passed: 0, failed: 0, skipped: 0}
    },
    config: options.config
  }
  const tag = result.config.tag
  result.features = calculateResult(result)
  const tplReport = await template.getTemplate()
  const partials = await template.getPartials()
  // console.log(result.features[0].elements[0].steps[2])
  const renderedReport = Mustache.render(tplReport, result, partials)
  return Promise.all([
    fs.outputFile(path.join(options.dest, 'report.html'), renderedReport),
    fs.outputFile(path.join(options.dest, 'summary.js'), 'var summary =' + JSON.stringify(result.summary)),
  ])
}

const formatDuration = function (duration) {
  return moment.duration(duration).format('h[h] m[m] s[s]')
}

module.exports = {
  generate: generateReport,
  validate: validateOption
}

