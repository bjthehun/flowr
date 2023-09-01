import { LAST_STEP, SteppingSlicer, STEPS_PER_SLICE } from '../../../core'
import { RShell, TokenMap } from '../../../r-bridge'
import { sendMessage } from './send'
import { answerForValidationError, validateBaseMessageFormat, validateMessage } from './validate'
import { FileAnalysisRequestMessage, requestAnalysisMessage } from './messages/analysis'
import { requestSliceMessage, SliceRequestMessage, SliceResponseMessage } from './messages/slice'
import { FlowrErrorMessage } from './messages/error'
import { Socket } from './net'
import { serverLog } from './server'
import { ILogObj, Logger } from 'tslog'

export interface FlowRFileInformation {
	filename: string,
	slicer: 	 SteppingSlicer
}

export class FlowRServerConnection {
	private readonly socket:   Socket
	private readonly shell:    RShell
	private readonly tokenMap: TokenMap
	private readonly name:     string
	private readonly logger:   Logger<ILogObj>

	// maps token to information
	private readonly fileMap = new Map<string, FlowRFileInformation>()


	// we do not have to ensure synchronized shell-access as we are always running synchronized
	constructor(socket: Socket, name: string, shell: RShell, tokenMap: TokenMap) {
		this.socket = socket
		this.tokenMap = tokenMap
		this.shell = shell
		this.name = name
		this.logger = serverLog.getSubLogger({ name })
		this.socket.on('data', data => this.handleData(String(data)))
	}

	private currentMessageBuffer = ''
	private handleData(message: string) {
		if(!message.endsWith('\n')) {
			this.currentMessageBuffer += message
			this.logger.trace(`[${this.name}] Received partial message. Buffering ${this.currentMessageBuffer.length}.`)
			return
		}
		message = this.currentMessageBuffer + message
		this.logger.debug(`[${this.name}] Received message: ${message}`)

		this.currentMessageBuffer = ''
		const request = validateBaseMessageFormat(message)
		if(request.type === 'error') {
			answerForValidationError(this.socket, request)
			return
		}
		switch(request.message.type) {
			case 'request-file-analysis':
				this.handleFileAnalysisRequest(request.message as FileAnalysisRequestMessage)
				break
			case 'request-slice':
				this.handleSliceRequest(request.message as SliceRequestMessage)
				break
			default:
				sendMessage<FlowrErrorMessage>(this.socket, {
					id:     request.message.id,
					type:   'error',
					fatal:  true,
					reason: `The message type ${JSON.stringify(request.type ?? 'undefined')} is not supported.`
				})
				this.socket.end()
		}
	}

	private handleFileAnalysisRequest(base: FileAnalysisRequestMessage) {
		const requestResult = validateMessage(base, requestAnalysisMessage)
		if(requestResult.type === 'error') {
			answerForValidationError(this.socket, requestResult, base.id)
			return
		}
		const message = requestResult.message
		this.logger.info(`[${this.name}] Received file analysis request for ${message.filename} (token: ${message.filetoken})`)

		if(this.fileMap.has(message.filetoken)) {
			this.logger.warn(`File token ${message.filetoken} already exists. Overwriting.`)
		}
		const slicer = new SteppingSlicer({
			stepOfInterest: LAST_STEP,
			shell:          this.shell,
			tokenMap:       this.tokenMap,
			// we have to make sure, that the content is not interpreted as a file path if it starts with 'file://' therefore, we do it manually
			request:        {
				request:                 message.content === undefined ? 'file' : 'text',
				content:                 message.content ?? message.filepath as string,
				attachSourceInformation: true,
				ensurePackageInstalled:  false
			},
			criterion: [] // currently unknown
		})
		this.fileMap.set(message.filetoken, {
			filename: message.filename,
			slicer
		})

		void slicer.allRemainingSteps(false).then(results => {
			sendMessage(this.socket, {
				type: 'response-file-analysis',
				id:   message.id,
				results
			})
		})
	}

	private handleSliceRequest(base: SliceRequestMessage) {
		const requestResult = validateMessage(base, requestSliceMessage)
		if(requestResult.type === 'error') {
			answerForValidationError(this.socket, requestResult, base.id)
			return
		}

		const request = requestResult.message


		this.logger.info(`[${request.filetoken}] Received slice request with criteria ${JSON.stringify(request.criterion)}`)

		const fileInformation = this.fileMap.get(request.filetoken)
		if(!fileInformation) {
			sendMessage<FlowrErrorMessage>(this.socket, {
				id:     request.id,
				type:   'error',
				fatal:  false,
				reason: `The file token ${request.filetoken} has never been analyzed.`
			})
			return
		}

		fileInformation.slicer.updateCriterion(request.criterion)
		void fileInformation.slicer.allRemainingSteps(true).then(results => {
			sendMessage<SliceResponseMessage>(this.socket, {
				type:    'response-slice',
				id:      request.id,
				results: Object.fromEntries(Object.entries(results).filter(([k,]) => Object.hasOwn(STEPS_PER_SLICE, k))) as SliceResponseMessage['results']
			})
		})
	}

}