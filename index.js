const { ApolloServer, gql, ApolloError } = require("apollo-server");
const axios = require("axios");
const redis = require("redis");
const bluebird = require("bluebird");
bluebird.promisifyAll(redis.RedisClient.prototype);
const client = redis.createClient();

const typeDefs = gql`
  type Query {
    getPokemon(id: String!): Pokemon
    getAllPokemons(pageNum: String!): Page
  }

  type Pokemon {
    id: ID!
    name: String!
    imageURL: String
    weight: String
    height: String
    base_experience: String
    order: String
  }

  type Page {
    pokemons: [MiniPokemon]
    prev: String
    next: String
  }

  type MiniPokemon {
    id: ID!
    name: String!
  }
`;

const resolvers = {
  Query: {
    getAllPokemons: async (_, args) => {
      const pageID = "page_" + args.pageNum;

      if (isNaN(parseInt(args.pageNum))) {
        throw new ApolloError("Request failed with status code 404", 404);
      }

      if (parseInt(args.pageNum) < 0) {
        throw new ApolloError("Request failed with status code 404", 404);
      }

      if ((await client.EXISTSAsync(pageID)) === 1) {
        const pageInfo = await client.getAsync(pageID);
        return JSON.parse(pageInfo);
      } else {
        const offset = args.pageNum * 20;
        const limit = 20;
        const { data } = await axios.get(
          `https://pokeapi.co/api/v2/pokemon/?offset=${offset}&limit=${limit}`
        );

        if (data.results.length == 0) {
          throw new ApolloError("Request failed with status code 404", 404);
        }
        let pageInfo = data.results.map(async (x) => {
          const temp = x.url.split("/");
          const pokemonID = temp[temp.length - 2];
          const pokemon = {
            name: x.name,
            id: pokemonID,
          };
          return pokemon;
        });

        pageInfo = await Promise.all(pageInfo);

        const pageData = {
          pokemons: pageInfo,
          prev: data.previous || "NOT FOUND",
          next: data.next || "NOT FOUND",
        };

        await client.setAsync(pageID, JSON.stringify(pageData));

        return pageData;
      }
    },

    getPokemon: async (_, args) => {
      const pokemonID = "pokemon_" + args.id;
      if ((await client.EXISTSAsync(pokemonID)) === 1) {
        const pokemon = await client.getAsync(pokemonID);
        return JSON.parse(pokemon);
      } else {
        const { data } = await axios.get(
          `https://pokeapi.co/api/v2/pokemon/${args.id}`
        );

        const pokemon = {
          name: data.name,
          id: data.id,
          imageURL:
            (data.sprites &&
              data.sprites.other &&
              data.sprites.other["official-artwork"] &&
              data.sprites.other["official-artwork"].front_default) ||
            "NOT FOUND",
          weight: (data.weight && data.weight.toString()) || "Not Found",
          height: (data.height && data.height.toString()) || "Not Found",
          base_experience:
            (data.base_experience && data.base_experience.toString()) ||
            "Not Found",
          order: (data.order && data.order.toString()) || "Not Found",
        };
        await client.setAsync(pokemonID, JSON.stringify(pokemon));
        return pokemon;
      }
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`Server running at ${url}`);
});
