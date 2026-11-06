import fs from 'fs'
import checker from 'license-checker'

export const generateLicenses = () => ({
	name: 'generate-licenses',
	buildStart() {
		if (!fs.existsSync('public/licenses/')) {
			fs.mkdirSync('public/licenses/')
		}
		return new Promise((resolve, reject) => {
			checker.init({ start: './' }, (err, packages) => {
				if (err) {
					reject(err)
					return
				}
				try {
					fs.writeFileSync('public/licenses/licenses.json', JSON.stringify(packages))
					Object.values(packages).forEach((packageInfo, index) => {
						if (!packageInfo.licenseFile) {
							console.warn(`No license file found for ${packageInfo.name ?? 'a dependency'}; skipping copy.`)
							return
						}
						fs.copyFileSync(packageInfo.licenseFile, `public/licenses/${index}.txt`)
					})
					resolve()
				} catch (error) {
					reject(error)
				}
			})
		})
	}
})
