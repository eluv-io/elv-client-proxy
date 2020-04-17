"use strict";

const path = require("path");
const AutoLoad = require("fastify-autoload");
const { ElvClient } = require("@eluvio/elv-client-js");
const UUID = (require("uuid")).v4;

const clients = {};

// Call config only once
let config;
const Config = async () => {
  if(!config) {
    config = await ElvClient.Configuration({
      configUrl: process.env["CONFIG_URL"]
    });
  }

  return config;
};

// Reinitialize client for each request
const Client = async ({privateKey}) => {
  if(!clients[privateKey]) {
    const {contentSpaceId, fabricURIs, ethereumURIs} = await Config();

    const client = new ElvClient({
      contentSpaceId,
      fabricURIs,
      ethereumURIs
    });

    client.configUrl = process.env["CONFIG_URL"];
    const wallet = client.GenerateWallet();
    const signer = wallet.AddAccount({privateKey});
    client.SetSigner({signer});

    clients[privateKey] = { client };
  }

  clients[privateKey].lastUsed = Date.now();

  return clients[privateKey].client;
};

const isByteArray = (value) => {
  if(!value) { return false; }

  if(typeof ArrayBuffer === "function" && (value instanceof ArrayBuffer || toString.call(value) === "[object ArrayBuffer]")) {
    // ArrayBuffer
    return true;
  }

  if(typeof value.byteLength !== "undefined") {
    // Byte Array
    return true;
  }
};

module.exports = function (fastify, opts, next) {
  Config().then(() => console.log("Config loaded"));

  fastify.post("/client", async (request, reply) => {
    const client = await Client({privateKey: request.body.privateKey});

    const requestId = UUID();

    const message = {
      type: "ElvFrameRequest",
      calledMethod: request.body.calledMethod,
      args: request.body.args,
      module: request.body.module,
      requestId
    };

    return await new Promise((resolve) => {
      client.CallFromFrameMessage(
        message,
        ({response, error}) => {
          if(error) {
            reply.code(error.status || 400);
            reply.send({error});
          } else {
            if(!response) {
              reply.code(204);
            }

            if(isByteArray(response)) {
              response = Buffer.from(response);
              reply.type("application/octet-stream");
            }

            reply.send(response);
          }

          resolve();
        }
      );
    });
  });





  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    options: Object.assign({}, opts)
  });

  // This loads all plugins defined in services
  // define your routes in one of these
  fastify.register(AutoLoad, {
    dir: path.join(__dirname, "services"),
    options: Object.assign({}, opts)
  });

  // Make sure to call next when done
  next();
};
