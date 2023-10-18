/* eslint-disable */
import axios from 'axios';

import { BigNumber, ethers } from 'ethers';
import { hdkey } from 'ethereumjs-wallet';
import { mnemonicToSeed } from 'bip39';

// import response format
import { response, walletResponse, balanceResponse } from '../../utils/response';
// import constants
import { ETHEREUM_DEFAULT } from '../../utils/constant';
// import actions
import {
    CREATE_WALLET,
    IMPORT_WALLET,
    CREATE_MASTERSEED,
    CREATE_ACCOUNT,
    IMPORT_ACCOUNT,
    GET_BALANCE,
    GET_TOKEN_BALANCE,
    GET_TOKEN,
    SEND_COIN,
    APPROVE_TOKEN,
    TRANSFER_TOKEN,
    GET_GAS,
    ETHER_GASSTATION_API,
    ERC721_INTERFACE_ID,
    ERC1155_INTERFACE_ID
} from '../../utils/constant';
// import ineterface
import { AnyObject } from '../../utils/globalType';
import { GasEstimationPayload } from 'utils/payloads/ethereum';
// import util functions
import {
    isContractAddress,
    isNftContract
} from '../../helper/ethereumHelper';
// import ABI
import { erc20ABI, ecr721ABI, erc1155ABI } from '../../abi'

import { weiToEther, gweiToEther, gweiToWei } from '../../utils/utils';

class EthereumWallet {
    
    provider: ethers.providers.JsonRpcProvider
    chainId: number = 0

    privateKey: string
    address: string
    signer: ethers.Wallet

    constructor(rpcUrl: string, privateKey?: string) {
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        
        this.provider.getNetwork().then(network => {
            this.chainId = network.chainId
        }).catch(() => {
            this.chainId = 0
        })

        if(privateKey) {
            this.signer = new ethers.Wallet(privateKey, this.provider)
            this.privateKey = privateKey
            this.address = this.signer.address
        }
        else {
            const _tempWallet = this.createWallet()
            this.signer = new ethers.Wallet(_tempWallet.privateKey, this.provider)
            this.privateKey = _tempWallet.privateKey
            this.address = _tempWallet.address
        }
    }

    /**
     * 
     * @param derivationPath 
     * @param nonce 
     * @returns {EvmWallet}
     */
    createWallet = (derivationPath?: string, nonce?: number): EvmWallet => {
        const path = derivationPath || ETHEREUM_DEFAULT;
        const index = nonce || Math.floor(Math.random() * 10);
    
        const wallet = ethers.Wallet.createRandom({ path: path + index });
    
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic.phrase,
            nonce: index
        }
    }

    /**
     * 
     * @param mnemonic 
     * @param nonce 
     * @param derivationPath 
     * @returns {EvmWallet}
     */
    importWallet = (mnemonic: string, nonce?: number, derivationPath?: string): EvmWallet => {
        const path = derivationPath || ETHEREUM_DEFAULT;
    
        const index = nonce || 0;
    
        const wallet = ethers.Wallet.fromMnemonic(mnemonic, path + index);
    
        return {
            address: wallet.address,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic.phrase,
            nonce: index
        }
    }

    /**
     * 
     * @param mnemonic 
     * @returns {Buffer}
     */
    createMasterSeedFromMnemonic = async (mnemonic: string): Promise<Buffer> => {
        try {
            const seed = await mnemonicToSeed(mnemonic);
            return seed;
        }
        catch(error) {
            throw error
        }
    }

    /**
     * 
     * @param rootKey 
     * @param nonce 
     * @returns {EvmAccount}
     */
    createAccount = async (rootKey: any, nonce: number): Promise<EvmAccount> => {
        try {
            const hdWallet = await hdkey.fromMasterSeed(rootKey);
            const wallet = hdWallet.derivePath(ETHEREUM_DEFAULT + nonce).getWallet();
            const address = `0x${wallet.getAddress().toString('hex')}`;
            const privateKey = wallet.getPrivateKey().toString('hex');
        
            return {
                address: address,
                privateKey: privateKey
            };
        }
        catch(error) {
            throw error
        }
    }

    /**
     * 
     * @param privateKey 
     * @returns {EvmAccount}
     */
    importAccount = (privateKey: string): EvmAccount => {
        const account = new ethers.Wallet(privateKey);
    
        return {
            address: account.address,
            privateKey: account.privateKey
        }
    }

    /**
     * 
     * @param address 
     * @returns {ethers.BigNumber}
     */
    getBalance = async (address?: string): Promise<BigNumber> => {
        const balance = await this.provider.getBalance(address || this.address);
        return balance
    }

    /**
     * 
     * @param tokenAddress 
     * @param address 
     * @param tokenId 
     * @returns {EvmTokenDetail}
     */
    getToken = async (tokenAddress: string, address?: string, tokenId?: number): Promise<EvmTokenDetail> => {
        const isContract = await this.isContractAddress(tokenAddress)
        let contract: ethers.Contract
        let tokenDetail: EvmTokenDetail
    
        if (!isContract) {
            tokenDetail = {
                name: '',
                symbol: '',
                decimals: 0,
                totalSupply: 0,
                balance: 0,
                isNft: false,
                tokenType: undefined
            }
        }
        else {
            const isNFT = await this.isNftContract(tokenAddress)
            if(isNFT.tokenType === 'ERC721') {
                contract = new ethers.Contract(tokenAddress, ecr721ABI, this.provider)

                try {
                    const [name, symbol, decimals, totalSupply, balance] = await Promise.all([
                        contract.name(),
                        contract.symbol(),
                        contract.decimals(),
                        contract.totalSupply(),
                        contract.balanceOf(address || this.address)
                    ]);
    
                    tokenDetail = {
                        name: name,
                        symbol: symbol,
                        decimals: decimals,
                        totalSupply: totalSupply,
                        balance: balance,
                        isNft: isNFT.isNFT,
                        tokenType: isNFT.tokenType
                    }
                } catch (error) {
                    throw error
                }
            }
            else if (isNFT.tokenType === 'ERC1155') {
                contract = new ethers.Contract(tokenAddress, erc1155ABI, this.provider)

                try {
                    const [name, symbol, decimals, totalSupply, balance] = await Promise.all([
                        contract.name(),
                        contract.symbol(),
                        contract.decimals(),
                        contract.totalSupply(),
                        tokenId ? contract.balanceOf(address || this.address, tokenId) : () =>  { return 0 }
                    ]);
    
                    tokenDetail = {
                        name: name,
                        symbol: symbol,
                        decimals: decimals,
                        totalSupply: totalSupply,
                        balance: balance,
                        isNft: isNFT.isNFT,
                        tokenType: isNFT.tokenType
                    }
                } catch (error) {
                    throw error
                }
            }
            else {
                contract = new ethers.Contract(tokenAddress, erc20ABI, this.provider)
    
                try {
                    const [name, symbol, decimals, totalSupply, balance] = await Promise.all([
                        contract.name(),
                        contract.symbol(),
                        contract.decimals(),
                        contract.totalSupply(),
                        contract.balanceOf(address || this.address)
                    ]);
    
                    tokenDetail = {
                        name: name,
                        symbol: symbol,
                        decimals: decimals,
                        totalSupply: totalSupply,
                        balance: balance,
                        isNft: isNFT.isNFT,
                        tokenType: isNFT.tokenType
                    }
                } catch (error) {
                    throw error
                }
            }
        }

        return tokenDetail
    }

    /**
     * 
     * @param tokenAddress 
     * @param address 
     * @returns {BigNumber}
     */
    getTokenBalance = async (tokenAddress: string, address?: string): Promise<BigNumber> => {
        try {
            const contract = new ethers.Contract(tokenAddress, erc20ABI, this.provider);
    
            const balance = await contract.balanceOf(address || this.address)
    
            return balance
        }
        catch (error) {
            throw error
        }
    }

    /**
     * 
     * @param receiveAddress 
     * @param amount 
     * @param gasPrice 
     * @param gasLimit 
     * @returns {ethers.Transaction}
     */
    sendEther = async (receiveAddress: string, amount: string, gasPrice?: any, gasLimit?: any): Promise<ethers.Transaction> => {
        try {
            let tx: ethers.Transaction;

            if(gasPrice && gasLimit) {
                tx = await this.signer.sendTransaction({
                    to: receiveAddress,
                    value: ethers.utils.parseUnits(amount),
                    gasPrice,
                    gasLimit
                })
            }
            else {
                tx = await this.signer.sendTransaction({
                    to: receiveAddress,
                    value: ethers.utils.parseEther(amount),
                })
            }

            return tx;
        }
        catch (error) {
            throw error
        }
    }

    /**
     * 
     * @param tokenAddress 
     * @param receiveAddress 
     * @param amount 
     * @param gasPrice 
     * @param gasLimit 
     * @returns {ethers.Transaction}
     */
    tokenApprove = async (tokenAddress: string, amount: string, receiveAddress: string, gasPrice?: any, gasLimit?: any): Promise<ethers.Transaction> => {
        const contract = new ethers.Contract(tokenAddress, erc20ABI, this.signer);
    
        try {
            let tx: ethers.Transaction;
    
            if(gasPrice && gasLimit) {
                tx = await contract.approve(receiveAddress, amount, { gasPrice: gasPrice, gasLimit: gasLimit });
            }
            else {
                tx = await contract.approve(receiveAddress, amount);
            }
    
            return tx
        } catch (error) {
            throw error
        }
    }

    /**
     * 
     * @param tokenAddress 
     * @param amount 
     * @param receiveAddress 
     * @param gasPrice 
     * @param gasLimit 
     * @returns {ethers.Transaction}
     */
    tokenTransfer = async (tokenAddress: string, amount: any, receiveAddress: string, gasPrice?: any, gasLimit?: any): Promise<ethers.Transaction> => {
        const contract = new ethers.Contract(tokenAddress, erc20ABI, this.signer);
    
        try {
            let tx: ethers.Transaction;
            if(gasPrice && gasLimit) {
                tx = await contract.transfer(receiveAddress, amount, { gasPrice, gasLimit });
            }
            else {
                tx = await contract.transfer(receiveAddress, amount);
            }
            return tx
        } catch (error) {
            throw error
        }
    }

    /* util function  */

    /**
     * 
     * @param address 
     * @returns {Boolean}
     */
    isContractAddress = async (address: string): Promise<boolean> => {
        try {
            const code = await this.provider.getCode(address);
            if (code !== '0x')
                return true;
            else
                return false;
        } catch {
            return false;
        }
    }

    /**
     * 
     * @param address 
     * @returns {IsNFT}
     */
    isNftContract = async (address: string): Promise<IsNFT> => {

        let isNFT: boolean
        let tokenType: ERCTokenType

        try {
            const isERC721NFT = await this.isERC721NFT(address)
            const isERC1155NFT = await this.isERC1155NFT(address)

            if(isERC721NFT) {
                isNFT = true
                tokenType = 'ERC721'
            }
            else if(isERC1155NFT) {
                isNFT = true
                tokenType = 'ERC1155'
            }
            else {
                isNFT = false
                tokenType = 'ERC20'
            }

            return { isNFT, tokenType }
        }
        catch(error) {
            throw error
        }
    }

    /**
     * 
     * @param address 
     * @returns {Boolean}
     */
    isERC721NFT = async (address: string): Promise<boolean> => {
        const contract = new ethers.Contract(address, ecr721ABI, this.provider)

        try {
            const is721NFT = await contract.supportsInterface(ERC721_INTERFACE_ID);
            if(is721NFT) return true
            else return false
        } catch {
            return false;
        }
    }

    /**
     * 
     * @param address 
     * @returns {Boolean}
     */
    isERC1155NFT = async (address: string): Promise<boolean> => {
        const contract = new ethers.Contract(address, erc1155ABI, this.provider)

        try {
            const is1155NFT = await contract.supportsInterface(ERC1155_INTERFACE_ID);
            if(is1155NFT) return true
            else return false
        } catch {
            return false;
        }
    }
}

export default EthereumWallet