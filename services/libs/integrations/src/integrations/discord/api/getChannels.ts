import axios from 'axios'
import { timeout } from '@crowd/common'
import { DiscordApiChannel, DiscordGetChannelsInput, DiscordGetMessagesInput } from '../types'
import getMessages from './getMessages'
import { IProcessStreamContext } from '../../../types'
import { getRateLimiter } from './handleRateLimit'
import { handleDiscordError } from './errorHandler'

/**
 * Try if a channel is readable
 * @param input getMessages input parameters
 * @param logger logger
 * @returns Limit if the channel is readable, false otherwise
 */
async function tryChannel(
  input: DiscordGetMessagesInput,
  ctx: IProcessStreamContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    const result = await getMessages(input, ctx, false)
    if (result.limit) {
      return result.limit
    }
    return false
  } catch (err) {
    return false
  }
}

async function getChannels(
  input: DiscordGetChannelsInput,
  ctx: IProcessStreamContext,
  tryChannels = true,
): Promise<DiscordApiChannel[]> {
  const rateLimiter = getRateLimiter(ctx)

  const config = {
    method: 'get',
    url: `https://discord.com/api/v10/guilds/${input.guildId}/channels?`,
    headers: {
      Authorization: input.token,
    },
  }

  try {
    await rateLimiter.checkRateLimit('getChannels')
    await rateLimiter.incrementRateLimit()

    const response = await axios(config)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = response.data

    if (tryChannels) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out: any[] = []
      for (const channel of result) {
        const limit = await tryChannel(
          {
            channelId: channel.id,
            token: input.token,
            perPage: 1,
            page: undefined,
          },
          ctx,
        )
        if (limit) {
          out.push(channel)
          if (limit <= 1 && limit !== false) {
            await timeout(5 * 1000)
          }
        }
      }
      return out
    }

    return result
  } catch (err) {
    const newErr = handleDiscordError(err, config, { input }, ctx)
    if (newErr) {
      throw newErr
    }
  }
}

export default getChannels
