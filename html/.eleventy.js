const nunjucks = require("nunjucks");
const sanitize = require("sanitize-filename");
const slugify = require('../shared/slugify')
const pluginRss = require("@11ty/eleventy-plugin-rss");

const collectionControl = require("./_data/collectionsControl.json");
const extraRedirects = require('./_config/redirects.json')

function markdownIt() {
  let options = {
    html: true,
    breaks: true,
    typographer: true,
    linkify: true,
  };
  let markdownIt = require("markdown-it")(options);
  
  markdownIt.renderer.rules.table_open = function() {
    return '<div class="twrap"><table>\n'
  }
  
  markdownIt.renderer.rules.table_close = function() {
    return '</table></div>\n'
  }
  
  markdownIt.renderer.rules.blockquote_open = function(token,idx) {
    return `<blockquote${token[idx + 2].content.toLowerCase().includes("[[penpen]]'s note") ? ` class="penpen"` : ''}>`
  }
  
  return (
    markdownIt
      //.use(require("markdown-it-obsidian")({baseURL: '/pages/c/'}))
      .use(require("markdown-it-table-of-contents"), { includeLevel: [2, 3, 4, 5] })
      .use(require("markdown-it-anchor"))
      .use(require("markdown-it-attrs"))
      .use(
        require("@gardeners/markdown-it-wikilinks")({
          postProcessPageName: (pageName) => {
            pageName = pageName.trim();
            pageName = pageName.split("/").map(sanitize).join("/");
            pageName = slugify(pageName)
            return pageName;
          },
          imagePattern: /!\[\[([^]+?)\]\]/,
          assetPrefix: '/assets/'
        })
      )
      .use(require('markdown-it-container'), 'details', {

        validate: function(params) {
          return params.trim().match(/^details\s+(.*)$/);
        },
      
        render: function (tokens, idx) {
          var m = tokens[idx].info.trim().match(/^details\s+(.*)$/);
          if (tokens[idx].nesting === 1) {
            // opening tag
            return '<details><summary>' + markdownIt.utils.escapeHtml(m[1]) + '</summary>\n';
          } else {
            // closing tag
            return '</details>\n';
          }
        }
      })
      .use(require("markdown-it-attribution"),{
        marker: '--',
        removeMarker: false
      })
  );
}

module.exports = function (eleventyConfig) {
  const markdown = markdownIt()
  
  eleventyConfig.addPlugin(require("@11ty/eleventy-plugin-syntaxhighlight"));
  eleventyConfig.addPlugin(pluginRss);

  eleventyConfig.addNunjucksFilter("interpolate", function (str) {
    return nunjucks.renderString(str, this.ctx);
  });
  eleventyConfig.addFilter("dropContentFolder", (path,folder) =>
    path.replace(new RegExp(folder + "\/"), "")
  );
  eleventyConfig.addFilter("slugshive", (path) =>
    slugify(path)
  );
  
  eleventyConfig.addFilter("renderMd", content => markdown.render(content))

  eleventyConfig.setLibrary("md", markdown);
  eleventyConfig.setFrontMatterParsingOptions({
    excerpt: (file, options) =>
      (file.excerpt = file.content.split("\n").slice(0, 4).join(" ")),
  });

  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy({ "_assets/*": "." });
  eleventyConfig.addPassthroughCopy({ "pages/garden/node/Assets/*": "assets" });

  // I won't even attempt to explain this
  eleventyConfig.addCollection("wtf", function (collectionApi) {
    // ok I lied
    // acess the first post that can get the information we need
    const firstPost = collectionApi.getFilteredByGlob("pages/garden/node/*.md")[0].data
    // and then pass it to itself to emulate computed
    const links = firstPost.eleventyComputed.brokenLinks(firstPost,true)
    // return as array for pagination
    return Array.from(links)
  });
  

  eleventyConfig.addNunjucksGlobal("getContext", function () {
    return this.ctx;
  });
  
  eleventyConfig.addNunjucksGlobal("getEnv", function (k,v) {
    return process.env[k] == v
  });

  eleventyConfig.addFilter("getType", function (thing) {
    return {}.toString
      .call(thing)
      .match(/\s([a-zA-Z]+)/)[1]
      .toLowerCase();
  });

  eleventyConfig.addFilter("random", function (array) {
    return array[Math.floor(Math.random() * array.length)];
  });
  
  eleventyConfig.addCollection("redirects", function (collectionApi) {
    // lets make a variable to hold our redirects
    let redirects = [];
    // We need to get each post in our posts folder. In my case this is /node
    const nodes = collectionApi.getFilteredByGlob("pages/garden/node/*.md");
    // next lets iterate over all the nodes
    nodes.forEach(node =>
      // for each alias 
      (node.data.aliases || []).forEach(alias =>
        // push the target url and the old url
        redirects.push([slugify(node.data.page.url),slugify(node.data.page.url).replace(/\/[^\/]*?(\..+)?$/, `/${alias}$1`)])
      )
    )
    
    redirects = [...redirects,...extraRedirects]
    
    return redirects
  })

  eleventyConfig.addCollection("taxes", function (collectionApi) {
    // lets make a variable to hold our taxonomies and values
    let taxAndValues = [];
    // We need to get each post in our posts folder. In my case this is /node
    const nodes = collectionApi.getFilteredByGlob("pages/garden/node/*.md");
    // next lets iterate over all the nodes
    nodes.forEach((node) => {
      // and then iterate over the taxonomies
      for (const [taxonomy, value] of Object.entries(collectionControl)) {
        // I don't want to paginate date, for instance
        // this is why my collectionControl is using objects instead of arrays
        if (value.excludeFromPagination) continue;
        else if (node?.data?.[taxonomy]) {
          // this is typeof on drugs
          switch (
            {}.toString
              .call(node.data[taxonomy])
              .match(/\s([a-zA-Z]+)/)[1]
              .toLowerCase()
          ) {
            // if it is an array (for tags especially)
            case "array":
              node.data[taxonomy].forEach((item) => {
                taxAndValues.push([taxonomy, item]);
              });
              break;
            // otherwise
            default:
              taxAndValues.push([taxonomy, node.data[taxonomy]]);
          }
        }
      }
    });

    // custom set, sets don't work with objects
    const unique = [...new Set(taxAndValues.map(JSON.stringify))].map(
      JSON.parse
    );

    return unique;
  });

  eleventyConfig.addCollection("nestedTax", function (collectionApi) {
    let nestedTax = {};
    const nodes = collectionApi.getFilteredByGlob("pages/garden/node/*.md");
    nodes.forEach((node) => {
      for (const [taxonomy, value] of Object.entries(collectionControl)) {
        const taxValue = node.data[taxonomy]

        if (value.excludeFromPagination) continue;
        else if (node?.data?.[taxonomy]) {
          if (!nestedTax[taxonomy]) nestedTax[taxonomy] = {};
          switch (
            {}.toString
              .call(taxValue)
              .match(/\s([a-zA-Z]+)/)[1]
              .toLowerCase()
          ) {
            case "array": {
              taxValue.forEach((item) => {
                // if the value in the object does not yet exist
                if (!nestedTax[taxonomy][item]) nestedTax[taxonomy][item] = [];
                // then add the entire page to it
                nestedTax[taxonomy][item].push(node);
              });
              break;
            }
            // otherwise
            default: {
              // if the value in the object does not yet exist
              if (!nestedTax[taxonomy][taxValue])
                nestedTax[taxonomy][taxValue] = [];
              // then add the entire page to it
              nestedTax[taxonomy][taxValue].push(node);
            }
          }
        }
      }
    });

    return nestedTax;
  });

  return {
    dir: {
      output: "dist",
    },
  };
};
